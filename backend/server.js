const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { PDFDocument, rgb } = require('pdf-lib');
const AdmZip = require('adm-zip');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const LEGACY_COMPAT_PORT = Number(process.env.LEGACY_COMPAT_PORT) || 3001;

const ENV_PATHS = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
];

function loadEnvFiles() {
  for (const envPath of ENV_PATHS) {
    dotenv.config({ path: envPath, override: false });
  }
}

function getOpenRouterApiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (key && key !== 'your_openrouter_api_key_here') return key;
  loadEnvFiles();
  const refreshedKey = process.env.OPENROUTER_API_KEY;
  return refreshedKey && refreshedKey !== 'your_openrouter_api_key_here' ? refreshedKey : null;
}

loadEnvFiles();

const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT !== undefined;
const DOCFLOW_WEBHOOK_SECRET = process.env.ELTEX_DOCFLOW_WEBHOOK_SECRET || 'eltex-docflow-2026-v1';
const DATA_DIR = process.env.DATA_DIR || (process.env.RAILWAY_ENVIRONMENT ? '/data' : __dirname);
const uploadDir = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
const assetUploadDir = path.join(DATA_DIR, 'uploads', 'assets');
fs.mkdirSync(assetUploadDir, { recursive: true });

// OpenRouter API config — key loaded from environment
const initialOpenRouterApiKey = getOpenRouterApiKey();
if (!initialOpenRouterApiKey) {
  console.warn('⚠️  OPENROUTER_API_KEY not set in .env — AI extraction will fail');
  console.warn(`   Checked: ${ENV_PATHS.join(' | ')}`);
} else {
  console.log('✅ OPENROUTER_API_KEY loaded:', initialOpenRouterApiKey.slice(0, 8) + '...');
}
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite-preview';

// ── Startup env-var validation ──────────────────────────────────────────────
if (isProduction) {
  const required = ['OPENROUTER_API_KEY', 'DASHBOARD_PASSWORD'];
  const missing = required.filter((k) => !process.env[k] || process.env[k] === 'your_openrouter_api_key_here');
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Server cannot start in production without these values.');
    process.exit(1);
  }
}

// ── Rate limiters (only enforce in production to keep tests fast) ───────────
const aiExtractLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  skip: () => !isProduction,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again in a minute.' },
});

const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  skip: () => !isProduction,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again in a minute.' },
});

// ── CORS allowed origins ────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : null;

// Middleware
// Compress all responses — reduces base64-heavy JSON payloads from 2-5MB to 300-700KB.
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: allowedOrigins
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-dashboard-token', 'x-project-token'],
}));
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(uploadDir));

// Lightweight health endpoint for Railway and external uptime checks.
// Keep this before any frontend proxy/static fallbacks so it always returns JSON.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'document-collection-backend',
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development',
  });
});

// Build a base formData with representation done (location: 'other') for flow tests
function buildBaseFlowFormData() {
  return {
    dni: { front: { photo: 'data:image/jpeg;base64,/9j/TEST_FRONT', extraction: null }, back: { photo: 'data:image/jpeg;base64,/9j/TEST_BACK', extraction: null }, originalPdfs: [] },
    ibi: { photo: 'data:image/jpeg;base64,/9j/TEST_IBI', pages: [], originalPdfs: [], extraction: null },
    electricityBill: { pages: [{ photo: 'data:image/jpeg;base64,/9j/TEST_BILL', extraction: null }], originalPdfs: [] },
    contract: null,
    location: 'other',
    representation: { location: 'other', isCompany: false, companyName: '', companyNIF: '', companyAddress: '', companyMunicipality: '', companyPostalCode: '', postalCode: '', ivaPropertyAddress: '', ivaCertificateSignature: null, representacioSignature: null, generalitatRole: 'titular', generalitatSignature: null, poderRepresentacioSignature: null, ivaCertificateEsSignature: null, renderedDocuments: {} },
    signatures: {},
    energyCertificate: {
      status: 'not-started',
      housing: { cadastralReference: '', habitableAreaM2: '', floorCount: '', averageFloorHeight: null, bedroomCount: '', doorsByOrientation: { north: '', east: '', south: '', west: '' }, windowsByOrientation: { north: '', east: '', south: '', west: '' }, windowFrameMaterial: null, doorMaterial: '', windowGlassType: null, hasShutters: null, shutterWindowCount: '' },
      thermal: { thermalInstallationType: null, boilerFuelType: null, equipmentDetails: '', hasAirConditioning: null, airConditioningType: null, airConditioningDetails: '', heatingEmitterType: null, radiatorMaterial: null },
      additional: { soldProduct: null, isExistingCustomer: null, hasSolarPanels: null, solarPanelDetails: '' },
      customerSignature: null, renderedDocument: null, completedAt: null, skippedAt: null
    }
  };
}

// Test-only: reset EC state for a test project (dev only)
app.post('/api/test/reset-ec/:code', (req, res) => {
  if (isProduction) return res.status(403).json({ error: 'Not available in production' });
  const testCodes = ['ELT20250004', 'ELT20250005'];
  const code = req.params.code;
  if (!testCodes.includes(code)) return res.status(403).json({ error: 'Only test projects can be reset' });
  const project = database.projects[code];
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.formData) project.formData = buildBaseFlowFormData();
  project.formData.energyCertificate = {
    status: 'not-started',
    housing: {
      cadastralReference: '', habitableAreaM2: '', floorCount: '', averageFloorHeight: null,
      bedroomCount: '', doorsByOrientation: { north: '', east: '', south: '', west: '' },
      windowsByOrientation: { north: '', east: '', south: '', west: '' },
      windowFrameMaterial: null, doorMaterial: '', windowGlassType: null,
      hasShutters: null, shutterWindowCount: ''
    },
    thermal: {
      thermalInstallationType: null, boilerFuelType: null, equipmentDetails: '',
      hasAirConditioning: null, airConditioningType: null, airConditioningDetails: '',
      heatingEmitterType: null, radiatorMaterial: null
    },
    additional: {
      soldProduct: null, isExistingCustomer: null, hasSolarPanels: null, solarPanelDetails: ''
    },
    customerSignature: null, renderedDocument: null, completedAt: null, skippedAt: null
  };
  saveDB();
  res.json({ success: true });
});

// Test-only: reset EC with partial housing data (simulates in-progress state for FLOW-03)
app.post('/api/test/reset-ec-partial/:code', (req, res) => {
  if (isProduction) return res.status(403).json({ error: 'Not available in production' });
  const testCodes = ['ELT20250004', 'ELT20250005'];
  const code = req.params.code;
  if (!testCodes.includes(code)) return res.status(403).json({ error: 'Only test projects can be reset' });
  const project = database.projects[code];
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.formData) project.formData = buildBaseFlowFormData();
  project.formData.energyCertificate = {
    status: 'not-started',
    housing: {
      cadastralReference: '1234567VK1234A0001RT',
      habitableAreaM2: '85',
      floorCount: '2',
      averageFloorHeight: null,
      bedroomCount: '3',
      doorsByOrientation: { north: '1', east: '0', south: '1', west: '0' },
      windowsByOrientation: { north: '2', east: '1', south: '3', west: '1' },
      windowFrameMaterial: null, doorMaterial: '', windowGlassType: null,
      hasShutters: null, shutterWindowCount: ''
    },
    thermal: {
      thermalInstallationType: null, boilerFuelType: null, equipmentDetails: '',
      hasAirConditioning: null, airConditioningType: null, airConditioningDetails: '',
      heatingEmitterType: null, radiatorMaterial: null
    },
    additional: {
      soldProduct: null, isExistingCustomer: null, hasSolarPanels: null, solarPanelDetails: ''
    },
    customerSignature: null, renderedDocument: null, completedAt: null, skippedAt: null
  };
  saveDB();
  res.json({ success: true });
});

// Test-only: restore full base flow state (property docs done, EC not-started) for FLOW-04 step 2
app.post('/api/test/restore-base-flow/:code', (req, res) => {
  if (isProduction) return res.status(403).json({ error: 'Not available in production' });
  const testCodes = ['ELT20250004', 'ELT20250005'];
  const code = req.params.code;
  if (!testCodes.includes(code)) return res.status(403).json({ error: 'Only test projects can be reset' });
  const project = database.projects[code];
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.formData = buildBaseFlowFormData();
  saveDB();
  res.json({ success: true });
});

// Test-only: clear property docs so the form starts at property-docs step (for FLOW-04)
app.post('/api/test/reset-property-docs/:code', (req, res) => {
  if (isProduction) return res.status(403).json({ error: 'Not available in production' });
  const testCodes = ['ELT20250004', 'ELT20250005'];
  const code = req.params.code;
  if (!testCodes.includes(code)) return res.status(403).json({ error: 'Only test projects can be reset' });
  const project = database.projects[code];
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.formData) project.formData = buildBaseFlowFormData();
  project.formData.dni = { front: { photo: null, extraction: null }, back: { photo: null, extraction: null }, originalPdfs: [] };
  project.formData.ibi = { photo: null, pages: [], originalPdfs: [], extraction: null };
  project.formData.electricityBill = { pages: [], originalPdfs: [] };
  project.formData.energyCertificate = {
    status: 'not-started',
    housing: {
      cadastralReference: '', habitableAreaM2: '', floorCount: '', averageFloorHeight: null,
      bedroomCount: '', doorsByOrientation: { north: '', east: '', south: '', west: '' },
      windowsByOrientation: { north: '', east: '', south: '', west: '' },
      windowFrameMaterial: null, doorMaterial: '', windowGlassType: null,
      hasShutters: null, shutterWindowCount: ''
    },
    thermal: {
      thermalInstallationType: null, boilerFuelType: null, equipmentDetails: '',
      hasAirConditioning: null, airConditioningType: null, airConditioningDetails: '',
      heatingEmitterType: null, radiatorMaterial: null
    },
    additional: {
      soldProduct: null, isExistingCustomer: null, hasSolarPanels: null, solarPanelDetails: ''
    },
    customerSignature: null, renderedDocument: null, completedAt: null, skippedAt: null
  };
  saveDB();
  res.json({ success: true });
});

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading DB, starting fresh:', e.message);
  }
  return { projects: getDefaultProjects() };
}

let _saveDBWriting = false;
let _saveDBDirty = false;
function saveDB() {
  _saveDBDirty = true;
  if (_saveDBWriting) return;
  function doWrite() {
    if (!_saveDBDirty) return;
    _saveDBDirty = false;
    _saveDBWriting = true;
    const snapshot = JSON.stringify(database, null, 2);
    fs.writeFile(DB_FILE, snapshot, 'utf8', (err) => {
      _saveDBWriting = false;
      if (err) console.error('Error saving DB:', err.message);
      if (_saveDBDirty) doWrite();
    });
  }
  setImmediate(doWrite);
}

function getDefaultProjects() {
  if (isProduction && process.env.SEED_SAMPLE_DATA !== 'true') {
    return {};
  }

  return {
    'ELT20250001': {
      code: 'ELT20250001',
      customerName: 'María García López',
      phone: '+34612345678',
      email: 'maria.garcia@email.com',
      productType: 'solar',
      assessor: 'Carlos Ruiz',
      assessorId: 'ASR001',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2025-03-15T10:00:00Z'
    },
    'ELT20250002': {
      code: 'ELT20250002',
      customerName: 'Juan Pérez Martínez',
      phone: '+34623456789',
      email: 'juan.perez@email.com',
      productType: 'aerothermal',
      assessor: 'Ana López',
      assessorId: 'ASR002',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2025-03-18T14:30:00Z'
    },
    'ELT20250003': {
      code: 'ELT20250003',
      customerName: 'Laura Fernández Ruiz',
      phone: '+34655443322',
      email: 'laura.fernandez@email.com',
      productType: 'solar',
      assessor: 'Pedro Sánchez',
      assessorId: 'ASR003',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2025-03-20T09:15:00Z'
    },
    'ELT20250004': {
      code: 'ELT20250004',
      customerName: 'Test EC Usuario',
      phone: '+34666000004',
      email: 'test.ec@eltex.es',
      productType: 'solar',
      assessor: 'Test Assessor',
      assessorId: 'ASR004',
      accessToken: 'ec-test-token-4444',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2026-04-02T10:00:00Z'
    },
    'ELT20250005': {
      code: 'ELT20250005',
      customerName: 'Test EC Flow Usuario',
      phone: '+34666000005',
      email: 'test.ec.flow@eltex.es',
      productType: 'solar',
      assessor: 'Test Assessor',
      assessorId: 'ASR005',
      accessToken: 'ec-flow-token-5555',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2026-04-02T10:00:00Z'
    }
  };
}

const database = loadDB();

// ── IDOR: Validate project access ───────────────────────────────────────────
function requireProject(req, res, next) {
  const code = req.params.code;
  const project = database.projects[code];
  if (!project) return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND', message: 'Proyecto no encontrado.' });

  req.project = project;
  next();
}

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se aceptan JPG, PNG y PDF.'));
  }
});

const ASSET_FIELDS = [
  { name: 'dniFront', maxCount: 1 },
  { name: 'dniBack', maxCount: 1 },
  ...Array.from({ length: 5 }, (_, i) => ({ name: `ibi_${i}`, maxCount: 1 })),
  ...Array.from({ length: 5 }, (_, i) => ({ name: `electricity_${i}`, maxCount: 1 })),
  { name: 'energyCert', maxCount: 1 },
  ...Array.from({ length: 5 }, (_, i) => ({ name: `dniOriginal_${i}`, maxCount: 1 })),
  ...Array.from({ length: 5 }, (_, i) => ({ name: `ibiOriginal_${i}`, maxCount: 1 })),
  ...Array.from({ length: 5 }, (_, i) => ({ name: `electricityOriginal_${i}`, maxCount: 1 })),
];

const assetStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(assetUploadDir, req.project?.code || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
    cb(null, `${file.fieldname}${ext}`);
  },
});

const assetUpload = multer({
  storage: assetStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'application/octet-stream'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se aceptan JPG, PNG y PDF.'));
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalizePhone(p) {
  if (!p) return '';
  // Strip spaces, dashes, dots, parentheses — preserve + and digits
  let clean = p.replace(/[\s\-().]/g, '');
  // Convert any 00XX international prefix → +XX (covers 0034, 0044, 0033, etc.)
  if (/^00\d/.test(clean)) clean = '+' + clean.slice(2);
  // Convert bare 34 + 9-digit Spanish number → +34XXXXXXXXX
  if (/^34\d{9}$/.test(clean)) return '+' + clean;
  // Convert bare 9-digit Spanish number (starts 6-9) → +34XXXXXXXXX
  if (/^\d{9}$/.test(clean) && /^[6-9]/.test(clean)) return '+34' + clean;
  // Already in +CC…  format or other — return as-is
  return clean;
}

function getEffectiveLocation(formData) {
  return formData?.location ?? formData?.representation?.location ?? null;
}

function getElectricityPages(formData) {
  const bill = formData?.electricityBill;
  if (!bill) return [];
  // New format: pages array
  if (Array.isArray(bill.pages)) return bill.pages;
  // Legacy format: front/back — migrate on-the-fly
  const pages = [];
  if (bill.front?.photo) pages.push(bill.front);
  if (bill.back?.photo) pages.push(bill.back);
  return pages;
}

function getIbiPages(formData) {
  if (Array.isArray(formData?.ibi?.pages) && formData.ibi.pages.length > 0) {
    return formData.ibi.pages;
  }
  return formData?.ibi?.photo ? [formData.ibi.photo] : [];
}

function getFirstElectricityData(formData) {
  const pages = getElectricityPages(formData);
  const merged = {};
  // Merge all pages' extracted data, first-found wins per field
  for (const page of pages) {
    const data = page?.extraction?.extractedData || {};
    for (const [key, value] of Object.entries(data)) {
      if (value && !merged[key]) merged[key] = value;
    }
  }
  return merged;
}

function getProjectSnapshot(formData) {
  const dniFront = formData?.dni?.front?.extraction?.extractedData || {};
  const dniBack = formData?.dni?.back?.extraction?.extractedData || {};
  const ibi = formData?.ibi?.extraction?.extractedData || {};
  const eb = getFirstElectricityData(formData);
  const contract = formData?.contract?.extraction?.extractedData || {};
  const representation = formData?.representation || {};

  const fullName = contract.fullName || dniFront.fullName || eb.titular || ibi.titular || '';
  let firstName = dniFront.firstName || null;
  let lastName = dniFront.lastName || null;

  // Derive firstName/lastName if DNI is missing
  if (!firstName && fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length > 0) {
      firstName = parts[0];
      if (parts.length > 1) {
        lastName = parts.slice(1).join(' ');
      }
    }
  }

  return {
    location: getEffectiveLocation(formData),
    dniFront,
    dniBack,
    ibi,
    electricityData: eb,
    contract,
    representation,
    // Contract is first priority; fall back to other document sources
    fullName,
    firstName,
    lastName,
    dniNumber: contract.nif || dniFront.dniNumber || eb.nifTitular || ibi.titularNif || '',
    address: contract.address || eb.direccionSuministro || dniBack.address || ibi.direccion || '',
    municipality: contract.municipality || eb.municipio || dniBack.municipality || ibi.municipio || '',
    province: contract.province || eb.provincia || ibi.provincia || '',
    postalCode: contract.postalCode || eb.codigoPostal || ibi.codigoPostal || representation.postalCode || '',
  };
}

function normalizeNamePart(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

function computeDashboardWarnings(formData) {
  const warnings = [];
  if (!formData) return warnings;

  const dniName = formData?.dni?.front?.extraction?.extractedData?.fullName ?? null;
  const ebPages = getElectricityPages(formData);
  const ebTitular = ebPages[0]?.extraction?.extractedData?.titular ?? null;

  if (dniName && ebTitular) {
    const dniWords = dniName.split(/\s+/).filter((w) => w.length > 2).map(normalizeNamePart);
    const ebWords = ebTitular.split(/\s+/).filter((w) => w.length > 2).map(normalizeNamePart);
    const hasCommonWord = dniWords.some((w) => ebWords.includes(w));
    if (!hasCommonWord) {
      warnings.push({
        key: 'titular-mismatch',
        message: `El nombre del DNI («${dniName}») no coincide con el titular de la factura de luz («${ebTitular}»). Comprueba que el documento pertenezca al mismo titular.`,
      });
    }
  }

  return warnings;
}

function getEnergyCertificate(formData) {
  return formData?.energyCertificate || null;
}

/**
 * Validates that an energyCertificate object has all required fields filled.
 * Kept in sync with app/src/lib/energyCertificateValidation.ts — update both
 * together whenever a required field is added or removed.
 * Returns true only if every required field across all three data steps is present.
 */
function isEcDataComplete(ec) {
  if (!ec) return false;
  const h = ec.housing || {};
  const t = ec.thermal || {};
  const a = ec.additional || {};

  // ── Housing ──────────────────────────────────────────────────────────────────
  // cadastralReference is intentionally optional — all other housing fields are required.
  const _area = h.habitableAreaM2 !== null && h.habitableAreaM2 !== undefined ? String(h.habitableAreaM2).trim() : '';
  if (!_area) return false;
  const _floors = h.floorCount !== null && h.floorCount !== undefined ? String(h.floorCount).trim() : '';
  if (!_floors) return false;
  const _bedrooms = h.bedroomCount !== null && h.bedroomCount !== undefined ? String(h.bedroomCount).trim() : '';
  if (!_bedrooms) return false;
  if (!h.averageFloorHeight) return false;

  // All four orientations for doors and windows must be filled in
  const directions = ['north', 'east', 'south', 'west'];
  const doors = h.doorsByOrientation || {};
  const windows = h.windowsByOrientation || {};
  const missingDoors = directions.some((d) => String(doors[d] ?? '').trim() === '');
  const missingWindows = directions.some((d) => String(windows[d] ?? '').trim() === '');
  if (missingDoors || missingWindows) return false;

  if (!h.windowFrameMaterial) return false;
  if (!String(h.doorMaterial ?? '').trim()) return false;
  if (!h.windowGlassType) return false;
  if (h.hasShutters === null || h.hasShutters === undefined) return false;
  if (h.hasShutters === true) {
    const _shutterCount = String(h.shutterWindowCount ?? '').trim();
    if (!_shutterCount) return false;
  }

  // ── Thermal ──────────────────────────────────────────────────────────────────
  if (!t.thermalInstallationType) return false;
  if (!t.boilerFuelType) return false;
  if (!String(t.equipmentDetails ?? '').trim()) return false;
  if (t.hasAirConditioning === null || t.hasAirConditioning === undefined) return false;
  if (t.hasAirConditioning === true && !t.airConditioningType) return false;
  if (t.hasAirConditioning === true && !String(t.airConditioningDetails ?? '').trim()) return false;
  if (!t.heatingEmitterType) return false;
  if ((t.heatingEmitterType === 'radiadores-agua' || t.heatingEmitterType === 'radiadores-electricos') && !t.radiatorMaterial) return false;
  if (!t.tipoFase) return false;
  if (t.tipoFase && t.tipoFaseConfirmed === false) return false;
  if (!String(t.cups ?? '').trim()) return false;

  // ── Additional ───────────────────────────────────────────────────────────────
  if (!a.soldProduct) return false;
  if (a.isExistingCustomer === null || a.isExistingCustomer === undefined) return false;
  if (a.hasSolarPanels === null || a.hasSolarPanels === undefined) return false;
  if (a.hasSolarPanels === true && !String(a.solarPanelDetails ?? '').trim()) return false;

  return true;
}

function buildDashboardSummary(project) {
  const formData = project?.formData || null;
  const snapshot = getProjectSnapshot(formData);
  const location = snapshot.location;
  const locality = [snapshot.postalCode, snapshot.municipality].filter(Boolean).join(' ');
  const displayAddress = [
    snapshot.address || null,
    locality || null,
    snapshot.province || null,
  ].filter(Boolean).join(', ') || null;

  const electricityPages = getElectricityPages(formData);
  const electricityDocs = electricityPages.length > 0
    ? electricityPages.map((page, i) => ({
        key: `electricity_${i}`,
        label: `Factura luz — pág. ${i + 1}`,
        shortLabel: `Luz ${i + 1}`,
        present: !!page?.photo?.preview || !!project.assetFiles?.[`electricity_${i}`],
        dataUrl: null,
        mimeType: null,
        needsManualReview: !!page?.extraction?.needsManualReview,
        extractedData: null,
      }))
    : [{ key: 'electricity_0', label: 'Factura de luz', shortLabel: 'Luz', present: false, dataUrl: null, mimeType: null, needsManualReview: false, extractedData: null }];

  const documents = [
    {
      key: 'dniFront',
      label: 'DNI frontal',
      shortLabel: 'DNI front',
      present: !!formData?.dni?.front?.photo?.preview || !!project.assetFiles?.dniFront,
      dataUrl: null,
      mimeType: null,
      needsManualReview: !!formData?.dni?.front?.extraction?.needsManualReview,
      extractedData: null,
    },
    {
      key: 'dniBack',
      label: 'DNI trasera',
      shortLabel: 'DNI back',
      present: !!formData?.dni?.back?.photo?.preview || !!project.assetFiles?.dniBack,
      dataUrl: null,
      mimeType: null,
      needsManualReview: !!formData?.dni?.back?.extraction?.needsManualReview,
      extractedData: null,
    },
    {
      key: 'ibi',
      label: 'IBI / Escritura',
      shortLabel: 'IBI',
      present: getIbiPages(formData).length > 0,
      dataUrl: null,
      mimeType: null,
      needsManualReview: !!formData?.ibi?.extraction?.needsManualReview,
      extractedData: null,
    },
  ];

  const signedDocuments = [];
  const representation = formData?.representation || {};
  const energyCertificate = getEnergyCertificate(formData);
  // Use explicit status field only; do NOT infer 'completed' from imageDataUrl presence
  // (legacy projects without the explicit status field correctly default to 'not-started')
  // Normalize to frontend-compatible values: 'not-started' / 'in-progress' → 'pending'.
  // Downgrade 'completed' → 'pending' whenever field validation fails, regardless of
  // whether a renderedDocument exists. Any empty required field = incomplete EC.
  // Mirrors getDashboardEnergyCertificateSummary() in dashboardProject.ts.
  const rawEcStatus = energyCertificate?.status
    || (energyCertificate?.skippedAt ? 'skipped' : 'not-started');
  const energyCertificateStatus =
    rawEcStatus === 'completed' && !isEcDataComplete(energyCertificate) ? 'pending'
    : rawEcStatus === 'completed' ? 'completed'
    : rawEcStatus === 'skipped' ? 'skipped'
    : 'pending';

  const signatureDeferred = !!representation.signatureDeferred;
  const signedDocStatus = (present) => present ? 'complete' : signatureDeferred ? 'deferred' : 'pending';

  if (location === 'cataluna') {
    const ivaPresent = !!representation.ivaCertificateSignature;
    const genPresent = !!representation.generalitatSignature;
    const repPresent = !!representation.representacioSignature;
    signedDocuments.push(
      { key: 'cataluna-iva', label: 'IVA 10% Cataluña', filename: 'iva_10_cataluna_firmado.pdf', present: ivaPresent, status: signedDocStatus(ivaPresent) },
      { key: 'cataluna-generalitat', label: 'Declaració Generalitat', filename: 'declaracio_generalitat_firmada.pdf', present: genPresent, status: signedDocStatus(genPresent) },
      { key: 'cataluna-representacio', label: 'Autorització de representació', filename: 'autoritzacio_representacio_firmada.pdf', present: repPresent, status: signedDocStatus(repPresent) }
    );
  } else if (location === 'madrid' || location === 'valencia') {
    const ivaEsPresent = !!representation.ivaCertificateEsSignature;
    const poderPresent = !!representation.poderRepresentacioSignature;
    signedDocuments.push(
      { key: 'spain-iva', label: 'IVA 10% España', filename: 'iva_10_espana_firmado.pdf', present: ivaEsPresent, status: signedDocStatus(ivaEsPresent) },
      { key: 'spain-poder', label: 'Poder de representación', filename: 'poder_representacion_firmado.pdf', present: poderPresent, status: signedDocStatus(poderPresent) }
    );
  }

  const allDocuments = [...documents, ...electricityDocs];
  const warnings = computeDashboardWarnings(formData);
  const energyCertificatePresent = energyCertificateStatus === 'completed';

  return {
    lastUpdated:
      project?.lastActivity
      || (project?.submissions?.length ? project.submissions[project.submissions.length - 1].timestamp : null)
      || project?.createdAt
      || null,
    location,
    address: displayAddress,
    displayAddress,
    customerDisplayName: snapshot.fullName || project?.customerName || '—',
    firstName: snapshot.firstName || null,
    lastName: snapshot.lastName || null,
    customerLanguage: project?.customerLanguage || project?.formData?.browserLanguage || null,
    postalCode: snapshot.postalCode || null,
    municipality: snapshot.municipality || null,
    province: snapshot.province || null,
    documents,
    electricityPages: electricityDocs,
    signedDocuments,
    energyCertificate: {
      status: energyCertificateStatus,
      present: energyCertificatePresent,
      completedAt: energyCertificate?.completedAt || null,
      skippedAt: energyCertificate?.skippedAt || null,
    },
    finalSignatures: [],
    photoGroups: [],
    downloadGroups: [],
    warnings,
    counts: {
      documentsPresent: allDocuments.filter((d) => d.present).length,
      documentsTotal: allDocuments.length,
      manualReview: allDocuments.filter((d) => d.needsManualReview).length,
      signedFormsPresent: signedDocuments.filter((d) => d.present).length,
      signedFormsTotal: signedDocuments.length,
      pdfsAvailable: signedDocuments.filter((d) => d.present).length,
      pdfsTotal: signedDocuments.length,
      energyCertificatePresent,
      energyCertificateTotal: 1,
      finalSignaturesPresent: 0,
      finalSignaturesTotal: 0,
      documentsRemaining: allDocuments.filter((d) => !d.present).length,
    }
  };
}

function serializeProject(project, { includeAccessToken = false } = {}) {
  const serialized = {
    code: project.code,
    customerName: project.customerName,
    phone: project.phone,
    email: project.email,
    productType: project.productType,
    assessor: project.assessor,
    assessorId: project.assessorId,
    formData: project.formData,
    assetFiles: project.assetFiles || {},
    lastActivity: project.lastActivity,
    createdAt: project.createdAt,
    submissionCount: Array.isArray(project.submissions) ? project.submissions.length : 0,
  };

  if (includeAccessToken) {
    serialized.accessToken = project.accessToken;
  }

  return serialized;
}

function serializeDashboardProject(project) {
  return {
    code: project.code,
    customerName: project.customerName,
    customerLanguage: project.customerLanguage || null,
    phone: project.phone,
    email: project.email,
    productType: project.productType,
    assessor: project.assessor,
    createdAt: project.createdAt,
    lastActivity: project.lastActivity,
    submissionCount: Array.isArray(project.submissions) ? project.submissions.length : 0,
    summary: buildDashboardSummary(project),
    cataloniaPDFs: project.cataloniaPDFs || { canGenerateRepresentacio: false, canGeneratePoder: false },
  };
}

function generateProjectCode() {
  const year = new Date().getFullYear();
  const existing = Object.keys(database.projects).filter(k => k.startsWith(`ELT${year}`));
  const maxNum = existing.reduce((max, k) => {
    const n = parseInt(k.replace(`ELT${year}`, ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `ELT${year}${String(maxNum + 1).padStart(4, '0')}`;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Backend is running', timestamp: new Date().toISOString() });
});

// Get project by code (protected by project access token)
app.get('/api/project/:code', requireProject, (req, res) => {
  res.json({ success: true, project: serializeProject(req.project) });
});

// Look up project by phone number
app.get('/api/lookup/phone/:phone', (req, res) => {
  const needle = normalizePhone(decodeURIComponent(req.params.phone));
  const project = Object.values(database.projects).find(p => normalizePhone(p.phone) === needle);
  if (!project) return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'No encontramos ningún proyecto con ese teléfono. Contacta con tu asesor.' });
  res.json({ success: true, project: serializeProject(project, { includeAccessToken: true }) });
});

// Create new project (SSR flow — phone number not yet in system)
app.post('/api/project/create', (req, res) => {
  const { phone, customerName, email, productType, assessor, assessorId } = req.body;

  if (!phone) return res.status(400).json({ success: false, message: 'El número de teléfono es obligatorio.' });

  const normalizedPhone = normalizePhone(phone);

  // Check for duplicate
  const existing = Object.values(database.projects).find(p => normalizePhone(p.phone) === normalizedPhone);
  if (existing) {
    return res.json({ success: true, project: serializeProject(existing, { includeAccessToken: true }), existing: true });
  }

  const code = generateProjectCode();
  const project = {
    code,
    accessToken: uuidv4(),
    customerName: customerName || 'Cliente nuevo',
    phone: normalizedPhone,
    email: email || '',
    productType: productType || 'solar',
    assessor: assessor || 'SSR',
    assessorId: assessorId || 'SSR',
    formData: null,
    submissions: [],
    lastActivity: null,
    createdAt: new Date().toISOString()
  };

  database.projects[code] = project;
  saveDB();

  res.json({ success: true, project: serializeProject(project, { includeAccessToken: true }), existing: false });
});

// ── Helper: Check if Catalonia PDFs can be generated ───────────────────────────────
function checkCataloniaPDFs(formData) {
  if (!formData) return { canGenerateRepresentacio: false, canGeneratePoder: false };

  const isCataluna = formData.representation?.location === 'cataluna';
  if (!isCataluna) return { canGenerateRepresentacio: false, canGeneratePoder: false };

  return {
    canGenerateRepresentacio: !!formData.representation?.representacioSignature,
    canGeneratePoder: !!formData.representation?.poderRepresentacioSignature,
  };
}

// existingFormData: the project's formData from the PREVIOUS save (before this submission
// overwrites it). Used as a fallback for DNI detection in follow-up sessions where the
// customer submits additional docs without re-capturing their DNI photo.
function extractCompletedDocKeys(formData, assetFiles, existingFormData = null) {
  const keys = [];
  const af = assetFiles || {};

  // DNI: check submitted photo, pre-uploaded file, AI extraction evidence, or previous session photo
  const hasDniFront = formData?.dni?.front?.photo
    || !!af.dniFront
    || !!formData?.dni?.front?.extraction
    || existingFormData?.dni?.front?.photo;
  const hasDniBack = formData?.dni?.back?.photo
    || !!af.dniBack
    || !!formData?.dni?.back?.extraction
    || existingFormData?.dni?.back?.photo;
  if (hasDniFront) keys.push('dni_front');
  if (hasDniBack)  keys.push('dni_back');

  // IBI: assetFiles uses keys ibi_0 … ibi_4 (not ibiPhoto)
  const hasIbi = formData?.ibi?.photo
    || (Array.isArray(formData?.ibi?.pages) && formData.ibi.pages.length > 0)
    || Object.keys(af).some(k => k.startsWith('ibi_'));
  if (hasIbi) keys.push('ibi');

  // Electricity: assetFiles uses keys electricity_0 … electricity_4 (not electricityPage0)
  const hasElectricity = (Array.isArray(formData?.electricityBill?.pages) && formData.electricityBill.pages.length > 0)
    || Object.keys(af).some(k => k.startsWith('electricity_'));
  if (hasElectricity) keys.push('electricity_bill');

  if (formData?.energyCertificate?.status === 'completed') {
    keys.push('energy_certificate');
  }

  const loc = formData?.representation?.location ?? formData?.location;

  if (loc === 'cataluna') {
    if (formData?.representation?.renderedDocuments?.catalunaIva)          keys.push('cataluna_iva');
    if (formData?.representation?.renderedDocuments?.catalunaGeneralitat)   keys.push('cataluna_generalitat');
    if (formData?.representation?.renderedDocuments?.catalunaRepresentacio) keys.push('cataluna_representacio');
  } else if (loc) {
    if (formData?.representation?.renderedDocuments?.spainIva)   keys.push('spain_iva');
    if (formData?.representation?.renderedDocuments?.spainPoder) keys.push('spain_poder');
  }

  return keys;
}

// Returns the baseline documents expected for a new project at creation time.
// Location-specific signed docs are unknown at creation and are not included.
function computeRequiredDocs(productType) {
  const docs = ['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate'];
  return docs;
}

// Fires new_order webhook to DocFlow. Returns true on success, false on failure.
// Awaitable — callers must await this to guarantee the row exists before any follow-up calls.
// On first submission, docs_uploaded is included so no separate doc_update is needed.
async function fireDocFlowNewOrder(project, docsUploaded = []) {
  const webhookUrl = process.env.ELTEX_DOCFLOW_WEBHOOK_URL;
  if (!webhookUrl) return true;

  const snapshot = getProjectSnapshot(project.formData);
  const payload = {
    type: 'new_order',
    order_id: project.code,
    customer_name: snapshot.fullName || (project.customerName !== 'Cliente nuevo' ? project.customerName : null) || 'cliente',
    first_name: snapshot.firstName || null,
    last_name: snapshot.lastName || null,
    phone: project.phone || '',
    locale: (project.customerLanguage || project.formData?.browserLanguage || '').split('-')[0] || null,
    contract_date: (project.createdAt || new Date().toISOString()).slice(0, 10),
    docs_required: computeRequiredDocs(project.productType),
    docs_uploaded: docsUploaded,
  };

  const headers = { 'Content-Type': 'application/json', 'X-Eltex-Webhook-Secret': DOCFLOW_WEBHOOK_SECRET };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    console.log(`[DocFlow] new_order sent for ${project.code} (docs: ${docsUploaded.join(', ') || 'none'})`);
    return true;
  } catch (err) {
    console.error(`[DocFlow] new_order failed for ${project.code}:`, err.message);
    return false;
  }
}

// Fires doc_update webhook fire-and-forget — does not block the caller.
function fireDocFlowDocUpdate(orderCode, docsUploaded) {
  const webhookUrl = process.env.ELTEX_DOCFLOW_WEBHOOK_URL;
  if (!webhookUrl) return;

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Eltex-Webhook-Secret': DOCFLOW_WEBHOOK_SECRET },
    body: JSON.stringify({ type: 'doc_update', order_id: orderCode, docs_uploaded: docsUploaded }),
  }).catch((err) => console.error(`[DocFlow] doc_update failed for ${orderCode}:`, err.message));
}

// Auto-save progress (requires access token)
app.post('/api/project/:code/save', requireProject, (req, res) => {
  const project = req.project;
  const { formData } = req.body;
  if (!formData || typeof formData !== 'object') {
    return res.status(400).json({ success: false, message: 'formData inválido.' });
  }
  project.formData = formData;
  project.lastActivity = new Date().toISOString();
  // Update customer name: contract → DNI → IBI titular → electricity titular
  const dniName = formData?.dni?.front?.extraction?.extractedData?.fullName;
  const contractName = formData?.contract?.extraction?.extractedData?.fullName;
  const ibiTitular = formData?.ibi?.extraction?.extractedData?.titular ?? null;
  const ebTitular = formData?.electricityBill?.pages?.[0]?.extraction?.extractedData?.titular ?? null;
  const resolvedName = contractName || dniName || ibiTitular || ebTitular;
  if (resolvedName) project.customerName = resolvedName;
  if (formData?.browserLanguage) project.customerLanguage = formData.browserLanguage;

  // Check if Catalonia PDFs can be generated
  const pdfStatus = checkCataloniaPDFs(formData);
  project.cataloniaPDFs = pdfStatus;

  saveDB();
  res.json({ success: true, message: 'Progreso guardado.', cataloniaPDFs: pdfStatus });
});

// Final submit (requires access token)
app.post('/api/project/:code/submit', requireProject, async (req, res) => {
  const project = req.project;
  const { formData, source } = req.body;
  if (!formData || typeof formData !== 'object') {
    return res.status(400).json({ success: false, message: 'formData inválido.' });
  }
  const submission = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    source: source || 'customer',
    ipAddress: req.ip,
    formData
  };
  // Capture existing formData BEFORE overwriting — used as DNI fallback in extractCompletedDocKeys
  const existingFormData = project.formData || null;
  project.submissions.push(submission);
  project.formData = formData;
  project.lastActivity = new Date().toISOString();
  // Update customer name: contract → DNI → IBI titular → electricity titular
  const dniName = formData?.dni?.front?.extraction?.extractedData?.fullName;
  const contractName = formData?.contract?.extraction?.extractedData?.fullName;
  const ibiTitular = formData?.ibi?.extraction?.extractedData?.titular ?? null;
  const ebTitular = formData?.electricityBill?.pages?.[0]?.extraction?.extractedData?.titular ?? null;
  const resolvedName = contractName || dniName || ibiTitular || ebTitular;
  if (resolvedName) project.customerName = resolvedName;
  if (formData?.browserLanguage) project.customerLanguage = formData.browserLanguage;

  // Check if Catalonia PDFs can be generated
  const pdfStatus = checkCataloniaPDFs(formData);
  project.cataloniaPDFs = pdfStatus;

  saveDB();
  res.json({ success: true, message: 'Documentación enviada correctamente.', submissionId: submission.id, cataloniaPDFs: pdfStatus });

  // DocFlow webhook sequence (after response is sent — does not block the customer).
  //
  // First submission: fire new_order (with docs_uploaded included in payload).
  //   doc_update is intentionally skipped — new_order already carries all doc info.
  //   This eliminates the race condition where doc_update would arrive at n8n before
  //   the new_order insert completed in Baserow.
  //
  // Subsequent submissions: fire doc_update only. new_order is never re-sent.
  //
  // Failure handling: if new_order fails, docflowNewOrderSent is rolled back so the
  //   next submission retries new_order (and again skips doc_update until it succeeds).
  const docsUploaded = extractCompletedDocKeys(formData, project.assetFiles, existingFormData);
  console.log(`[DocFlow] ${project.code} docs detected: ${docsUploaded.join(', ') || 'none'}`);

  if (!project.docflowNewOrderSent) {
    project.docflowNewOrderSent = true;
    saveDB();
    const ok = await fireDocFlowNewOrder(project, docsUploaded);
    if (!ok) {
      // new_order failed — roll back flag so next submit retries.
      // doc_update is also suppressed this submission (no point updating a row that doesn't exist yet).
      project.docflowNewOrderSent = false;
      saveDB();
    }
    // doc_update intentionally skipped on first submit — new_order payload contains docs_uploaded.
  } else {
    // Subsequent submissions: only doc_update fires.
    fireDocFlowDocUpdate(project.code, docsUploaded);
  }
});

// Pre-upload binary assets (photos + PDFs) so the final submit payload can skip them.
// Called from the review screen on mount — the user reads the screen while uploads happen.
app.post('/api/project/:code/upload-assets', requireProject, (req, res, next) => {
  assetUpload.fields(ASSET_FIELDS)(req, res, (err) => {
    if (err) {
      console.error('[upload-assets] multer error:', err);
      return res.status(400).json({ success: false, message: err.message || 'Error al subir archivos.' });
    }
    next();
  });
}, (req, res) => {
  const project = req.project;
  const files = req.files || {};
  const assetFiles = { ...(project.assetFiles || {}) };
  const projectAssetsPath = `/uploads/assets/${project.code}`;

  for (const [fieldName, fileArray] of Object.entries(files)) {
    if (Array.isArray(fileArray) && fileArray.length > 0) {
      assetFiles[fieldName] = `${projectAssetsPath}/${fileArray[0].filename}`;
    }
  }

  project.assetFiles = assetFiles;
  project.lastActivity = new Date().toISOString();
  saveDB();

  res.json({ success: true, savedKeys: Object.keys(assetFiles) });
});

// Generic file upload endpoint is admin-only; customer flows use structured save APIs.
app.post('/api/upload', requireDashboardAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió archivo.' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, fileUrl, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
});

// ── Dashboard auth ─────────────────────────────────────────────────────────────
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || (!isProduction ? 'eltex2025' : null);
const DASHBOARD_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DASHBOARD_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const DASHBOARD_LOGIN_MAX_ATTEMPTS = 10;
const dashboardSessions = new Map();
const dashboardLoginAttempts = new Map();

function purgeExpiredDashboardSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of dashboardSessions.entries()) {
    if (expiresAt <= now) dashboardSessions.delete(token);
  }
}

function getLoginAttemptEntry(ip) {
  const now = Date.now();
  const existing = dashboardLoginAttempts.get(ip);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + DASHBOARD_LOGIN_WINDOW_MS };
    dashboardLoginAttempts.set(ip, fresh);
    return fresh;
  }
  return existing;
}

if (isProduction && !DASHBOARD_PASSWORD) {
  console.warn('⚠️  DASHBOARD_PASSWORD not set; dashboard login is disabled until configured.');
}

app.post('/api/dashboard/login', (req, res) => {
  purgeExpiredDashboardSessions();
  if (!DASHBOARD_PASSWORD) {
    return res.status(503).json({ success: false, message: 'Dashboard login is not configured.' });
  }

  const clientIp = req.ip || 'unknown';
  const attempts = getLoginAttemptEntry(clientIp);
  if (attempts.count >= DASHBOARD_LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ success: false, message: 'Demasiados intentos. Inténtalo de nuevo más tarde.' });
  }

  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Contraseña requerida.' });
  if (password !== DASHBOARD_PASSWORD) {
    attempts.count += 1;
    return res.status(401).json({ success: false, message: 'Contraseña incorrecta.' });
  }

  dashboardLoginAttempts.delete(clientIp);
  const token = uuidv4();
  dashboardSessions.set(token, Date.now() + DASHBOARD_SESSION_TTL_MS);
  res.json({ success: true, token });
});

app.post('/api/dashboard/logout', (req, res) => {
  const token = req.headers['x-dashboard-token'];
  if (token) dashboardSessions.delete(token);
  res.json({ success: true });
});

function requireDashboardAuth(req, res, next) {
  purgeExpiredDashboardSessions();
  const token = req.headers['x-dashboard-token'];
  const expiresAt = token ? dashboardSessions.get(token) : null;
  if (!token || !expiresAt) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Acceso no autorizado.' });
  }

  if (expiresAt <= Date.now()) {
    dashboardSessions.delete(token);
    return res.status(401).json({ success: false, error: 'SESSION_EXPIRED', message: 'La sesión del dashboard ha caducado.' });
  }
  next();
}

// ── Dashboard endpoint ─────────────────────────────────────────────────────────
app.get('/api/dashboard', requireDashboardAuth, (req, res) => {
  const projects = Object.values(database.projects).map((project) => serializeDashboardProject(project)).sort((a, b) => {
    const leftDate = new Date(a.summary?.lastUpdated || 0).getTime();
    const rightDate = new Date(b.summary?.lastUpdated || 0).getTime();
    return rightDate - leftDate;
  });
  res.json({ success: true, projects });
});

app.get('/api/dashboard/project/:code', requireDashboardAuth, (req, res) => {
  const project = database.projects[req.params.code];
  if (!project) {
    return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND', message: 'Proyecto no encontrado.' });
  }
  res.json({ success: true, project: serializeProject(project, { includeAccessToken: true }) });
});

// ── Delete a project (admin only) ─────────────────────────────────────────────
app.delete('/api/dashboard/project/:code', requireDashboardAuth, async (req, res) => {
  const { code } = req.params;
  const project = database.projects[code];
  if (!project) {
    return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND', message: 'Proyecto no encontrado.' });
  }

  // Remove uploaded asset files from disk
  const projectAssetsDir = path.join(assetUploadDir, code);
  try {
    await fs.promises.rm(projectAssetsDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[delete] Could not remove asset directory for ${code}:`, err.message);
  }

  delete database.projects[code];
  saveDB();

  console.log(`[delete] Project ${code} deleted by admin`);
  res.json({ success: true });
});

// ── Dashboard CSV export ────────────────────────────────────────────────────────
app.get('/api/dashboard/export/csv', requireDashboardAuth, (req, res) => {
  const projects = Object.values(database.projects);

  const escape = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const headers = [
    'Código', 'Cliente', 'Teléfono', 'Email', 'Producto', 'Asesor',
    'Fecha creación', 'Última actividad', 'Envíos', 'Ubicación',
    'DNI Número', 'DNI Nombre', 'DNI Nacimiento', 'DNI Validez',
    'DNI Domicilio', 'DNI Municipio', 'DNI Provincia',
    'Ref. Catastral', 'Titular IBI', 'Dirección IBI',
    'CUPS', 'Potencia (kW)', 'Tipo fase', 'Dirección suministro',
    'Firma cliente', 'Firma comercial'
  ];

  const rows = projects.map(p => {
    const fd = p.formData;
    const dniFront = fd?.dni?.front?.extraction?.extractedData || {};
    const dniBack = fd?.dni?.back?.extraction?.extractedData || {};
    const ibi = fd?.ibi?.extraction?.extractedData || {};
    const snapshot = getProjectSnapshot(fd);
    const sigs = fd?.signatures || {};

    return [
      p.code,
      p.customerName,
      p.phone,
      p.email,
      p.productType,
      p.assessor,
      p.createdAt ? new Date(p.createdAt).toLocaleString('es-ES') : '',
      p.lastActivity ? new Date(p.lastActivity).toLocaleString('es-ES') : '',
      p.submissions.length,
      snapshot.location || '',
      dniFront.dniNumber || '',
      dniFront.fullName || '',
      dniFront.dateOfBirth || '',
      dniFront.expiryDate || '',
      dniBack.address || '',
      dniBack.municipality || '',
      dniBack.province || '',
      ibi.referenciaCatastral || '',
      ibi.titular || '',
      ibi.direccion || '',
      snapshot.electricityData.cups || '',
      snapshot.electricityData.potenciaContratada || '',
      snapshot.electricityData.tipoFase || '',
      snapshot.electricityData.direccionSuministro || '',
      sigs.customerSignature ? 'Sí' : 'No',
      sigs.repSignature ? 'Sí' : 'No',
    ].map(escape).join(',');
  });

  const csv = [headers.map(escape).join(','), ...rows].join('\r\n');
  const filename = `eltex_expedientes_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv); // BOM for Excel
});

// ── Admin formdata update (dashboard auth) ────────────────────────────────────
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return source ?? target;
  if (!target || typeof target !== 'object') return source;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key]; // arrays and primitives replace
    }
  }
  return result;
}

app.put('/api/project/:code/admin-formdata', requireDashboardAuth, (req, res) => {
  const { code } = req.params;
  const { formDataPatch } = req.body;

  const project = database.projects[code];
  if (!project) return res.status(404).json({ success: false, message: 'Proyecto no encontrado.' });
  if (!formDataPatch || typeof formDataPatch !== 'object') {
    return res.status(400).json({ success: false, message: 'formDataPatch requerido.' });
  }

  project.formData = deepMerge(project.formData || {}, formDataPatch);
  project.lastActivity = new Date().toISOString();

  const dniName = project.formData?.dni?.front?.extraction?.extractedData?.fullName;
  if (dniName) project.customerName = dniName;

  const pdfStatus = checkCataloniaPDFs(project.formData);
  project.cataloniaPDFs = pdfStatus;

  saveDB();
  res.json({ success: true, formData: project.formData });
});

// ── Download all project files as a ZIP ───────────────────────────────────────
app.get('/api/project/:code/download-zip', requireDashboardAuth, async (req, res) => {
  const project = database.projects[req.params.code];
  if (!project) return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });

  const fd = project.formData;
  const zip = new AdmZip();

  const addBase64File = (label, dataUrl, folder) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
    if (!mimeMatch) return;
    const mime = mimeMatch[1];
    const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]?.split('+')[0] || 'jpg';
    const base64Data = dataUrl.slice(mimeMatch[0].length);
    const buffer = Buffer.from(base64Data, 'base64');
    const safeName = label.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    zip.addFile(`${folder}/${safeName}.${ext}`, buffer);
  };

  const addRenderedPdfFile = async (label, imageDataUrl, folder) => {
    const pdfBuffer = await renderedImageToPdfBuffer(imageDataUrl);
    if (!pdfBuffer) return;
    const safeName = label.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    zip.addFile(`${folder}/${safeName}.pdf`, pdfBuffer);
  };

  const addStoredFiles = (label, files, folder) => {
    if (!Array.isArray(files)) return;
    files.forEach((file, index) => {
      addBase64File(files.length === 1 ? label : `${label}_${index + 1}`, file?.dataUrl, folder);
    });
  };

  // Read a pre-uploaded binary asset from disk and add to the ZIP.
  // Returns true if the file was found; caller can fall back to base64 otherwise.
  const addFileFromPath = (label, assetKey, folder) => {
    const assetPath = project.assetFiles?.[assetKey];
    if (!assetPath) return false;
    const fullPath = path.join(DATA_DIR, assetPath.replace(/^\//, ''));
    if (!fs.existsSync(fullPath)) return false;
    const ext = path.extname(fullPath).slice(1) || 'jpg';
    const safeName = label.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    zip.addFile(`${folder}/${safeName}.${ext}`, fs.readFileSync(fullPath));
    return true;
  };

  // Try pre-uploaded file first; fall back to inline base64.
  const addDocumentFile = (label, dataUrl, assetKey, folder) => {
    if (!addFileFromPath(label, assetKey, folder)) {
      addBase64File(label, dataUrl, folder);
    }
  };

  // Try pre-uploaded file first for stored PDFs; fall back to inline base64 array.
  const addStoredFilesWithFallback = (label, files, assetKeyPrefix, folder) => {
    const assetFiles = project.assetFiles || {};
    const assetKeys = Object.keys(assetFiles)
      .filter(k => k.startsWith(`${assetKeyPrefix}_`))
      .sort();
    if (assetKeys.length > 0) {
      assetKeys.forEach((key, idx) => {
        addFileFromPath(assetKeys.length === 1 ? label : `${label}_${idx + 1}`, key, folder);
      });
    } else {
      addStoredFiles(label, files, folder);
    }
  };

  if (fd) {
    const ibiPages = getIbiPages(fd);
    addDocumentFile('DNI_frontal', fd.dni?.front?.photo?.preview, 'dniFront', '1_documentos');
    addDocumentFile('DNI_trasera', fd.dni?.back?.photo?.preview, 'dniBack', '1_documentos');
    addStoredFilesWithFallback('DNI_original_pdf', fd.dni?.originalPdfs, 'dniOriginal', '1_documentos');
    ibiPages.forEach((page, i) => {
      const label = ibiPages.length === 1 ? 'IBI' : `IBI_${i + 1}`;
      addDocumentFile(label, page?.preview, `ibi_${i}`, '1_documentos');
    });
    addStoredFilesWithFallback('IBI_original_pdf', fd.ibi?.originalPdfs, 'ibiOriginal', '1_documentos');

    const getElecPages = (formData) => {
      const eb = formData.electricityBill;
      if (Array.isArray(eb?.pages)) return eb.pages;
      if (Array.isArray(eb)) return eb;
      return [];
    };
    getElecPages(fd).forEach((page, i) => {
      addDocumentFile(`Factura_luz_${i + 1}`, page?.photo?.preview, `electricity_${i}`, '1_documentos');
    });
    addStoredFilesWithFallback('Factura_luz_original_pdf', fd.electricityBill?.originalPdfs, 'electricityOriginal', '1_documentos');

    const energyCertificate = fd.energyCertificate;
    const energyCertAssetPath = project.assetFiles?.energyCert;
    if (energyCertAssetPath) {
      const fullPath = path.join(DATA_DIR, energyCertAssetPath.replace(/^\//, ''));
      if (fs.existsSync(fullPath)) {
        const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(fullPath).toString('base64')}`;
        await addRenderedPdfFile('Certificado_energetico', dataUrl, '2_certificados');
      } else if (energyCertificate?.renderedDocument?.imageDataUrl) {
        await addRenderedPdfFile('Certificado_energetico', energyCertificate.renderedDocument.imageDataUrl, '2_certificados');
      }
    } else if (energyCertificate?.renderedDocument?.imageDataUrl) {
      await addRenderedPdfFile('Certificado_energetico', energyCertificate.renderedDocument.imageDataUrl, '2_certificados');
    }
  }

  const zipBuffer = zip.toBuffer();
  const safeName = (project.customerName || project.code).replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `${project.code}_${safeName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', zipBuffer.length);
  res.send(zipBuffer);
});

// ── Download all images for a project as a ZIP-like JSON bundle ────────────────
// (Returns a JSON manifest so the front-end can trigger downloads)
app.get('/api/project/:code/download-manifest', requireDashboardAuth, (req, res) => {
  const project = database.projects[req.params.code];
  if (!project) return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });

  const fd = project.formData;
  const files = [];

  const addDataUrlFile = (label, dataUrl, category) => {
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      files.push({
        label,
        category,
        dataUrl,
        mimeType: dataUrl.slice(5, dataUrl.indexOf(';')) || 'application/octet-stream'
      });
    }
  };

  const addStoredManifestFiles = (label, storedFiles, category) => {
    if (!Array.isArray(storedFiles)) return;
    storedFiles.forEach((file, index) => {
      addDataUrlFile(storedFiles.length === 1 ? label : `${label}_${index + 1}`, file?.dataUrl, category);
    });
  };

  // Read a pre-uploaded asset from disk and push a data URL entry into the manifest.
  const addManifestFileFromPath = (label, assetKey, category) => {
    const assetPath = project.assetFiles?.[assetKey];
    if (!assetPath) return false;
    const fullPath = path.join(DATA_DIR, assetPath.replace(/^\//, ''));
    if (!fs.existsSync(fullPath)) return false;
    const ext = path.extname(fullPath).slice(1) || 'jpg';
    const mime = ext === 'pdf' ? 'application/pdf' : `image/${ext}`;
    const buf = fs.readFileSync(fullPath);
    files.push({ label, category, dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mimeType: mime });
    return true;
  };

  // Try pre-uploaded file first; fall back to inline data URL.
  const addManifestDocumentFile = (label, dataUrl, assetKey, category) => {
    if (!addManifestFileFromPath(label, assetKey, category)) {
      addDataUrlFile(label, dataUrl, category);
    }
  };

  const addStoredManifestFilesWithFallback = (label, storedFiles, assetKeyPrefix, category) => {
    const assetFiles = project.assetFiles || {};
    const assetKeys = Object.keys(assetFiles)
      .filter(k => k.startsWith(`${assetKeyPrefix}_`))
      .sort();
    if (assetKeys.length > 0) {
      assetKeys.forEach((key, idx) => {
        addManifestFileFromPath(assetKeys.length === 1 ? label : `${label}_${idx + 1}`, key, category);
      });
    } else {
      addStoredManifestFiles(label, storedFiles, category);
    }
  };

  if (fd) {
    const ibiPages = getIbiPages(fd);
    addManifestDocumentFile('DNI_frontal', fd.dni?.front?.photo?.preview, 'dniFront', 'document');
    addManifestDocumentFile('DNI_trasera', fd.dni?.back?.photo?.preview, 'dniBack', 'document');
    addStoredManifestFilesWithFallback('DNI_original_pdf', fd.dni?.originalPdfs, 'dniOriginal', 'document-original-pdf');
    ibiPages.forEach((page, index) => {
      const label = ibiPages.length === 1 ? 'IBI' : `IBI_${index + 1}`;
      addManifestDocumentFile(label, page?.preview, `ibi_${index}`, 'document');
    });
    addStoredManifestFilesWithFallback('IBI_original_pdf', fd.ibi?.originalPdfs, 'ibiOriginal', 'document-original-pdf');
    getElectricityPages(fd).forEach((page, index) => {
      addManifestDocumentFile(`Factura_luz_${index + 1}`, page?.photo?.preview, `electricity_${index}`, 'document');
    });
    addStoredManifestFilesWithFallback('Factura_luz_original_pdf', fd.electricityBill?.originalPdfs, 'electricityOriginal', 'document-original-pdf');
    addDataUrlFile('Firma_iva_cat', fd.representation?.ivaCertificateSignature, 'signed-form-signature');
    addDataUrlFile('Firma_generalitat', fd.representation?.generalitatSignature, 'signed-form-signature');
    addDataUrlFile('Firma_representacio_cat', fd.representation?.representacioSignature, 'signed-form-signature');
    addDataUrlFile('Firma_iva_es', fd.representation?.ivaCertificateEsSignature, 'signed-form-signature');
    addDataUrlFile('Firma_poder_es', fd.representation?.poderRepresentacioSignature, 'signed-form-signature');
    addManifestDocumentFile('Certificado_energetico', fd.energyCertificate?.renderedDocument?.imageDataUrl, 'energyCert', 'generated-document');
    addDataUrlFile('Firma_cliente', fd.signatures?.customerSignature, 'final-signature');
    addDataUrlFile('Firma_comercial', fd.signatures?.repSignature, 'final-signature');
  }

  res.json({ success: true, projectCode: project.code, customerName: project.customerName, files });
});

// ── PDF → Images via Stirling-PDF API ──────────────────────────────────────────
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const STIRLING_PDF_URL = process.env.STIRLING_PDF_URL || 'https://s-pdf-production-ed78.up.railway.app/api/v1/convert/pdf/img';

function getStirlingApiKey() {
  const key = process.env.STIRLING_PDF_API_KEY;
  if (key) return key;
  loadEnvFiles();
  return process.env.STIRLING_PDF_API_KEY || null;
}

app.post('/api/pdf-to-images', pdfLimiter, pdfUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún archivo PDF.' });
    }

    const apiKey = getStirlingApiKey();

    // Short-circuit: if no API key is configured, skip the Stirling-PDF network
    // call entirely and tell the frontend to fall back to browser conversion.
    // This saves the ~300-600ms wasted on a guaranteed-401 external request.
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Stirling-PDF no configurado (falta STIRLING_PDF_API_KEY). Usando conversión local.'
      });
    }

    // Build multipart request for Stirling-PDF
    const boundary = `----FormBoundary${Date.now()}`;
    const parts = [];

    const addField = (name, value) => {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      );
    };

    addField('imageFormat', 'png');
    addField('singleImage', 'false');
    addField('dpi', '200');

    // File part header
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="fileInput"; filename="${req.file.originalname}"\r\nContent-Type: application/pdf\r\n\r\n`;
    const fileFooter = `\r\n--${boundary}--\r\n`;

    const bodyParts = Buffer.concat([
      Buffer.from(parts.join('')),
      Buffer.from(fileHeader),
      req.file.buffer,
      Buffer.from(fileFooter),
    ]);

    const stirlingRes = await fetch(STIRLING_PDF_URL, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
      },
      body: bodyParts,
    });

    if (!stirlingRes.ok) {
      const errText = await stirlingRes.text().catch(() => '');
      console.error(`[pdf-to-images] Stirling-PDF error ${stirlingRes.status}:`, errText.slice(0, 200));
      const missingKey = !apiKey && (stirlingRes.status === 401 || stirlingRes.status === 403);
      if (missingKey) {
        return res.status(500).json({
          success: false,
          message: 'Servicio de conversión de PDF no configurado (falta STIRLING_PDF_API_KEY).'
        });
      }
      return res.status(502).json({ success: false, message: `El servicio de conversión de PDF devolvió un error (${stirlingRes.status}).` });
    }

    const zipBuffer = Buffer.from(await stirlingRes.arrayBuffer());

    let zip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch (e) {
      console.error('[pdf-to-images] Failed to parse ZIP response:', e.message);
      return res.status(502).json({ success: false, message: 'La respuesta del servicio de conversión no era válida.' });
    }

    const entries = zip.getEntries()
      .filter(e => !e.isDirectory && /\.(png|jpg|jpeg)$/i.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

    if (entries.length === 0) {
      return res.status(502).json({ success: false, message: 'El PDF no generó ninguna imagen. Comprueba que el archivo sea válido.' });
    }

    const images = entries.map(entry => {
      const ext = entry.entryName.match(/\.(png|jpg|jpeg)$/i)?.[1]?.toLowerCase() || 'png';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const fileName = entry.entryName.replace(/^.*[\\/]/, '');
      return {
        name: fileName,
        data: entry.getData().toString('base64'),
        mimeType,
      };
    });

    console.log(`[pdf-to-images] Converted "${req.file.originalname}" → ${images.length} image(s)`);
    res.json({ success: true, images });

  } catch (err) {
    console.error('[pdf-to-images] Unexpected error:', err);
    const message = err instanceof Error ? err.message : '';
    const likelyUpstreamConnectivityIssue = /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(message);
    if (likelyUpstreamConnectivityIssue) {
      return res.status(502).json({
        success: false,
        message: 'No se pudo conectar con el servicio de conversión de PDF. Inténtalo de nuevo en unos minutos.'
      });
    }
    res.status(500).json({ success: false, message: 'Error inesperado al convertir el PDF.' });
  }
});

// ── AI Document Extraction ─────────────────────────────────────────────────────

// Validate that an extracted identity number looks like a real DNI, NIE, or passport number.
// Used as a safety-net: if the AI says isCorrectDocument=true but extracted no recognisable number,
// we flag it for manual review rather than silently accepting garbage.
function isValidIdentityNumber(number) {
  if (!number || typeof number !== 'string') return false;
  const n = number.toUpperCase().replace(/[\s\-\.]/g, '');
  if (/^\d{8}[A-Z]$/.test(n)) return true;           // Spanish DNI
  if (/^[XYZT]\d{7}[A-Z]$/.test(n)) return true;     // Spanish NIE
  if (/^[A-Z]{1,3}\d{5,9}[A-Z0-9]?$/.test(n)) return true; // Passport (most formats)
  if (/^[A-Z0-9]{6,12}$/.test(n)) return true;        // Other international identity numbers
  return false;
}

const PROMPTS = {
  dniFront: `You are a document data extractor for Spanish identity documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

Your PRIMARY goal is to find and extract an identity number from this document. Accepted documents include:
- Spanish DNI card (number format: 8 digits + letter, e.g. 12345678A)
- Spanish NIE card or certificate (number format: X/Y/Z + 7 digits + letter, e.g. X1234567A)
- Passport (any country — extract the passport number into dniNumber field)

Extract:
1. Full name (apellidos + nombre exactly as printed) — in fullName field
2. First name only (nombre) — in firstName field
3. Last name(s) only (apellidos) — in lastName field
4. Identity number (DNI/NIE number OR passport number) — put it in the dniNumber field
5. Date of birth — YYYY-MM-DD
6. Expiry date — YYYY-MM-DD
7. Sex (M or F)

Set isCorrectDocument: false ONLY if the image does NOT contain any recognisable identity number. Do not reject based on document type alone.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"DNI front","isReadable":true,"extractedData":{"fullName":"string or null","firstName":"string or null","lastName":"string or null","dniNumber":"string or null","dateOfBirth":"string or null","expiryDate":"string or null","sex":"M or F or null","nationality":"string or null"},"confidence":0.95,"notes":"string"}`,

  dniBack: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

Extract from the BACK of a Spanish DNI or NIE card:
1. Full address (domicilio) — street, number, floor, door — every character must be readable
2. Municipality (municipio/localidad)
3. Province (provincia)
4. Place of birth (lugar de nacimiento)

Set isCorrectDocument: false if this image clearly has no address data and is not the back of any identity document.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"DNI back","isReadable":true,"extractedData":{"address":"string or null","municipality":"string or null","province":"string or null","placeOfBirth":"string or null"},"confidence":0.95,"notes":"string"}`,

  ibi: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. Photos taken of a screen or monitor are acceptable as long as the document content is real and readable.

CRITICAL — BLANK / TEMPLATE / PLACEHOLDER DETECTION: If the document is clearly a blank form, demo template, or example — meaning the data fields are empty OR filled with obvious placeholder values such as repeating characters (e.g. "xxxxxxx", "0000000", "AAAAAAA"), dummy reference codes, or sample text — set isCorrectDocument: false. Do NOT try to extract data from blank or template documents. The user must upload their actual completed IBI receipt with their real property data (real owner name, real address, real Referencia Catastral). A form from a government web portal that is displayed but has no real data filled in is NOT acceptable.

Extract from a Spanish IBI receipt, property-tax debit notice, or Escritura:
1. Referencia Catastral — exactly 20 alphanumeric characters. Must be a genuine cadastral reference, NOT placeholder text with repeating characters (e.g. "xxxxxxxDFxxxxxxxxx" is a placeholder — return null). If the value contains 4 or more consecutive identical characters, it is likely a placeholder — return null.
2. Titular (property owner full name) — must be a real person or company name, not a label or placeholder
3. NIF del titular if visible
4. Full property address (dirección del inmueble) only. Do NOT include RC/reference, tax year, amount, payment text, or summary labels in this field.
5. Código postal if visible
6. Municipality / province if visible
7. Tax year / ejercicio or charge date if visible
8. Total amount if visible

If this is clearly NOT an IBI/property-tax/escritura document, set isCorrectDocument: false.
If ALL key fields (referenciaCatastral, titular, direccion) are null, empty, or placeholder values, set isCorrectDocument: false — this is a blank or incomplete form, not a real document.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"IBI receipt","isReadable":true,"extractedData":{"referenciaCatastral":"string or null","titular":"string or null","titularNif":"string or null","direccion":"string or null","codigoPostal":"string or null","municipio":"string or null","provincia":"string or null","ejercicio":"string or null","importe":"string or null"},"confidence":0.95,"notes":"string"}`,

  electricity: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. Photos taken of a screen or monitor are acceptable as long as the document content is real and readable. When in doubt, ACCEPT and extract what you can.

Extract ALL visible fields from ANY page of a Spanish electricity bill (factura de electricidad). Different pages may show different data — extract whatever is present.

Extract:
1. Titular del suministro (customer name) if visible
2. NIF/NIE del titular if visible — if any character is unclear, return null instead of guessing
3. Dirección del suministro (supply/property address ONLY — not company or billing-office addresses)
4. Código postal (5-digit number)
5. Municipio if visible
6. Provincia if visible
7. CUPS number — must start with "ES" and be 20–22 characters, fully readable
8. Potencia contratada (contracted power in kW) — numeric value only (e.g., "3.45", "5.5")
9. Tipo de fase — "monofasica" or "trifasica" (lowercase, no accents)
10. Tarifa / peaje if visible
11. Comercializadora / distribuidora if visible
12. Fecha de la factura (invoice date) if visible
13. Periodo de facturación if visible
14. Importe total if visible

CRITICAL — DOCUMENT VALIDATION RULES:
- ONLY set isCorrectDocument: true if the image is a Spanish electricity bill (factura de luz/electricidad).
- Set isCorrectDocument: false for ANY other utility bill: gas bills (factura de gas), water bills (factura de agua), telephone/internet/fiber bills (factura de teléfono/internet).
- Set isCorrectDocument: false for unrelated documents: DNI, IBI, passport, bank statement, or non-utility documents.
- BLANK / TEMPLATE / PLACEHOLDER DETECTION: If the fields contain placeholder values (e.g., "xxxxxxx", "0000000", "TITULAR AQUÍ") OR if ALL key fields (CUPS, titular, direccion) are empty/missing, set isCorrectDocument: false with reason "blank template".

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"electricity bill","isReadable":true,"extractedData":{"titular":"string or null","nifTitular":"string or null","direccionSuministro":"string or null","codigoPostal":"string or null","municipio":"string or null","provincia":"string or null","cups":"string or null","potenciaContratada":"string or null","tipoFase":"monofasica or trifasica or null","tarifaAcceso":"string or null","comercializadora":"string or null","distribuidora":"string or null","fechaFactura":"string or null","periodoFacturacion":"string or null","importe":"string or null"},"confidence":0.95,"notes":"string"}`,

  dniAuto: `You are a document data extractor for Spanish identity documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

Your PRIMARY goal is to extract a person's identity number from whatever document is shown. Accepted documents include:
- Spanish DNI plastic card
- Spanish NIE green card / EU citizen registration card
- One-page NIE certificate on paper
- Passport (any country)

Classify identityDocumentKind as:
- "dni-card" — Spanish DNI
- "nie-card" — Spanish NIE card or EU registration card
- "nie-certificate" — One-page NIE certificate on paper
- "passport" — Any passport booklet or card

Then determine side:
- "front": the side with the holder's identity number, full name, birth date, expiry date — OR the main page of a NIE certificate or passport
- "back": the reverse of a DNI/NIE card (legal text, address, place of birth)

Important rules:
- A green NIE card with holder data and address is still the FRONT.
- The reverse/legal-text side of a green NIE card is STILL a correct document. Mark it as isCorrectDocument: true, identityDocumentKind: "nie-card", side: "back".
- A one-page NIE certificate is always side: "front".
- A passport is always side: "front".
- Set isCorrectDocument: false ONLY if the image does NOT contain any recognisable identity number (DNI/NIE/passport number). Do not reject based on document type alone.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"side":"front or back","identityDocumentKind":"dni-card or nie-card or nie-certificate or passport","isCorrectDocument":true,"documentTypeDetected":"string","isReadable":true,"extractedData":{"fullName":"string or null","firstName":"string or null","lastName":"string or null","dniNumber":"string or null","dateOfBirth":"YYYY-MM-DD or null","expiryDate":"YYYY-MM-DD or null","sex":"M or F or null","nationality":"string or null","address":"string or null","municipality":"string or null","province":"string or null","placeOfBirth":"string or null"},"confidence":0.95,"notes":"string"}

Respond ONLY with this exact JSON (no markdown, no extra text).`
,

  contract: `You are a document data extractor for Eltex Solar sales contracts.

This is a Spanish photovoltaic / aerothermal installation sales contract or budget (Orden de venta / Contrato de servicios / Presupuesto) from Eltex Solar. The document may have many pages — scan ALL pages for the fields below.

Extract:
1. Customer full name (nombre y apellidos del CLIENTE — the buyer, not Eltex staff)
2. Customer NIF/NIE number — ONLY if it is a valid Spanish format (8 digits + letter, or X/Y/Z + 7 digits + letter). If the value is "False", a placeholder, or clearly invalid, return null.
3. Full installation address (dirección del emplazamiento / domicilio del cliente — street, number, floor, postal code, municipality)
4. Postal code (5 digits)
5. Municipality (municipio / localidad)
6. Province (provincia — e.g. Tarragona, Barcelona, Madrid, Valencia, Sevilla)
7. Customer email
8. Assessor / sales rep name (asesor de ventas — person's name only, strip the word "Asesor")
9. Product type — classify as exactly one of: "solo-paneles", "solo-aerotermia", "paneles-y-aerotermia". Use "solo-paneles" for solar/fotovoltaica only. Use "solo-aerotermia" for aerothermal only. Use "paneles-y-aerotermia" if both appear.
10. Contract / budget reference number (e.g. SO-26/00283)

Important rules:
- The CUSTOMER is the party under "Datos de clientes" or "Don/Doña ... mayor de edad con NIF ...". Do NOT extract Eltex's own company data.
- Do NOT extract any price, amount, or cost figures.
- If this is NOT a sales contract or installation service agreement, set isCorrectDocument: false.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"Eltex sales contract","isReadable":true,"extractedData":{"fullName":"string or null","nif":"string or null","address":"string or null","postalCode":"string or null","municipality":"string or null","province":"string or null","email":"string or null","assessorName":"string or null","productType":"solo-paneles or solo-aerotermia or paneles-y-aerotermia or null","contractNumber":"string or null"},"confidence":0.95,"notes":"string"}`,

  dniAutoBatch: `You are a document data extractor for Spanish identity documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract what you can.

COMBINED IMAGE RULE — READ CAREFULLY: If a single image shows BOTH sides of the document at the same time (two cards stacked, or both sides on one scan/photo), apply ALL of these rules:
1. Set side: "front" — the DNI number and personal identity data take priority.
2. Extract ONLY the front-side fields: fullName, firstName, lastName, dniNumber, dateOfBirth, expiryDate, sex, nationality.
3. Set address, municipality, province, placeOfBirth to null — these are back-side fields. Do NOT read them from the back even if visible. Keep them null.
4. Add "combined image" to the notes field.
This prevents data from two different sides being mixed into one result.

Your PRIMARY goal is to extract a person's identity number from whatever documents are shown. Accepted documents include:
- Spanish DNI plastic card
- Spanish NIE green card / EU citizen registration card
- One-page NIE certificate on paper
- Passport (any country)

For EACH attached image, in the SAME ORDER as received:
1. Determine identityDocumentKind: "dni-card", "nie-card", "nie-certificate", or "passport"
2. Determine side: "front" or "back" (passports and NIE certificates are always "front")
3. Set isCorrectDocument: false ONLY if the image contains NO recognisable identity number (DNI/NIE/passport number). Do not reject based on document type alone.
4. If it is unreadable, set isReadable: false
5. Extract the visible fields and set fields not present on that page to null. Put the identity number (DNI/NIE number or passport number) in the dniNumber field.

Important rules:
- A green NIE card side with holder data is the FRONT, even if it also shows address.
- The reverse/legal-text side of a green NIE card is STILL a correct document. Mark it as identityDocumentKind: "nie-card", side: "back", even if it has little or no personal data.
- A one-page NIE certificate is STILL a correct document: identityDocumentKind: "nie-certificate", side: "front".
- A passport is always side: "front" and identityDocumentKind: "passport".

Respond ONLY with this exact JSON shape (no markdown, no extra text):
{"results":[{"side":"front or back","identityDocumentKind":"dni-card or nie-card or nie-certificate or passport","isCorrectDocument":true,"documentTypeDetected":"string","isReadable":true,"extractedData":{"fullName":"string or null","firstName":"string or null","lastName":"string or null","dniNumber":"string or null","dateOfBirth":"YYYY-MM-DD or null","expiryDate":"YYYY-MM-DD or null","sex":"M or F or null","nationality":"string or null","address":"string or null","municipality":"string or null","province":"string or null","placeOfBirth":"string or null"},"confidence":0.95,"notes":"string"}]}

Return exactly one result object per image, preserving the same order as the input images.`
};

const IDENTITY_DOCUMENT_KINDS = new Set(['dni-card', 'nie-card', 'nie-certificate', 'passport']);

function normalizeExtractedStringFields(extractedData) {
  if (!extractedData || typeof extractedData !== 'object') return extractedData;
  const normalized = { ...extractedData };
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'string') {
      normalized[key] = value.replace(/\s+/g, ' ').trim() || null;
    }
  }
  return normalized;
}

function normalizeIdentityExtraction(item) {
  if (!item || typeof item !== 'object') return item;

  const normalized = { ...item };
  normalized.extractedData = normalizeExtractedStringFields(normalized.extractedData) || {};

  const extractedData = normalized.extractedData;
  const detectedText = `${normalized.documentTypeDetected || ''} ${normalized.notes || ''}`.toLowerCase();
  const hasIdentityCore = Boolean(
    extractedData.fullName
    || extractedData.dniNumber
    || extractedData.dateOfBirth
    || extractedData.expiryDate
    || extractedData.sex
    || extractedData.nationality
  );
  const hasAddressData = Boolean(
    extractedData.address
    || extractedData.municipality
    || extractedData.province
    || extractedData.placeOfBirth
  );
  const explicitBackCue =
    detectedText.includes('back side')
    || detectedText.includes('back')
    || detectedText.includes('reverse')
    || detectedText.includes('reverso')
    || detectedText.includes('dorso')
    || detectedText.includes('trasera')
    || detectedText.includes('legal text');

  let identityDocumentKind = IDENTITY_DOCUMENT_KINDS.has(normalized.identityDocumentKind)
    ? normalized.identityDocumentKind
    : null;

  if (!identityDocumentKind) {
    const dniNumber = String(extractedData.dniNumber || '').toUpperCase();
    if (detectedText.includes('nie-certificate') || detectedText.includes('nie certificate') || detectedText.includes('certificado') || detectedText.includes('certificat')) {
      identityDocumentKind = 'nie-certificate';
    } else if (detectedText.includes('nie') || /^[XYZT]/.test(dniNumber)) {
      identityDocumentKind = 'nie-card';
    } else {
      identityDocumentKind = 'dni-card';
    }
  }

  const aiExplicitSide = normalized.side === 'front' || normalized.side === 'back'
    ? normalized.side
    : null;

  let side = aiExplicitSide;

  // passport and nie-certificate are always single-page → always front
  if (identityDocumentKind === 'nie-certificate' || identityDocumentKind === 'passport') {
    side = 'front';
  } else if (hasAddressData && !hasIdentityCore) {
    // Pure back-side image: has address data but NO identity core (name/number/dob)
    // This is the strongest signal that it is a standalone back photo.
    side = 'back';
  } else if (hasAddressData && hasIdentityCore) {
    // COMBINED IMAGE: the AI saw both sides and returned data from both.
    // The AI should have set side='front' via the prompt instruction, trust it.
    // If the AI didn't specify, default to 'front' (identity number takes priority).
    if (!side) side = 'front';
  } else if (explicitBackCue) {
    side = 'back';
  } else if (!side) {
    // Only infer side when the AI didn't specify one
    if (hasIdentityCore) side = 'front';
    else if (identityDocumentKind === 'nie-card') side = 'back';
  }

  // Defence layer: strip fields that don't belong to the resolved side.
  // This handles the case where the AI bled data from both sides into one result
  // (combined-image cross-contamination). Each slot should only contain its own fields.
  if (side === 'front') {
    // Address fields live on the back — never store them in the front extraction
    extractedData.address = null;
    extractedData.municipality = null;
    extractedData.province = null;
    extractedData.placeOfBirth = null;
  } else if (side === 'back') {
    // Identity fields live on the front — never store them in the back extraction
    extractedData.fullName = null;
    extractedData.firstName = null;
    extractedData.lastName = null;
    extractedData.dniNumber = null;
    extractedData.dateOfBirth = null;
    extractedData.expiryDate = null;
    extractedData.sex = null;
    extractedData.nationality = null;
  }

  normalized.identityDocumentKind = identityDocumentKind;
  normalized.side = side;
  return normalized;
}


app.post('/api/extract', aiExtractLimiter, async (req, res) => {
  const { imageBase64, imagesBase64, documentType } = req.body;
  // Accept either a single image or an array of images (multi-page PDFs)
  const imagesToSend = imagesBase64 && Array.isArray(imagesBase64) && imagesBase64.length > 0
    ? imagesBase64
    : imageBase64 ? [imageBase64] : null;
  if (!imagesToSend || !documentType) return res.status(400).json({ success: false, message: 'Faltan imageBase64 o documentType.' });

  const prompt = PROMPTS[documentType];
  if (!prompt) return res.status(400).json({ success: false, message: `Tipo de documento no soportado: ${documentType}` });

  const openRouterApiKey = getOpenRouterApiKey();
  if (!openRouterApiKey) {
    return res.status(503).json({ success: false, isUnreadable: false, needsManualReview: true, reason: 'temporary-error', message: 'Servicio de extracción no configurado. Contacta al administrador.' });
  }

  // Build content parts: text prompt + one image part per uploaded page
  const imageContent = imagesToSend.map(img => ({
    type: 'image_url',
    image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
  }));

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openRouterApiKey}` },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: imagesToSend.length > 1 ? `${prompt}\n\nNota: el documento tiene ${imagesToSend.length} páginas, todas adjuntas. Analiza el conjunto para extraer los datos.` : prompt },
            ...imageContent
          ]
        }],
        max_tokens: 800,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenRouter error:', response.status, errText);
      let userMessage = 'No se pudo analizar automáticamente. Revisa la API key de OpenRouter.';
      if (response.status === 401) userMessage = 'API key de OpenRouter inválida o no configurada.';
      else if (response.status === 402) userMessage = 'Créditos de OpenRouter agotados.';
      else if (response.status === 429) userMessage = 'Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.';
      return res.json({ success: false, isUnreadable: false, needsManualReview: true, reason: 'temporary-error', message: userMessage });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log(`[extract:${documentType}] AI response:`, content.slice(0, 300));

    let extraction;
    try {
      const m = content.match(/\{[\s\S]*\}/);
      extraction = m ? JSON.parse(m[0]) : null;
    } catch (e) {
      console.error('JSON parse error:', e.message);
      extraction = null;
    }

    if (!extraction) return res.json({ success: false, isUnreadable: true, reason: 'unreadable', message: 'No se pudo analizar la imagen. Asegúrate de que el documento esté bien iluminado y enfocado.' });

    // Reject blurry / unreadable images — must retake
    if (extraction.isReadable === false) {
      return res.json({
        success: false,
        isUnreadable: true,
        reason: 'unreadable',
        message: 'La imagen no es lo suficientemente clara. Por favor, vuelve a hacer la foto asegurándote de: buena iluminación, sin reflejos ni sombras, documento completo y texto perfectamente enfocado.'
      });
    }

    if (!extraction.isCorrectDocument) {
      return res.json({
        success: false,
        isWrongDocument: true,
        reason: 'wrong-document',
        message: `Documento incorrecto. Por favor sube ${documentType.includes('dni') ? 'el DNI/NIE' : documentType === 'ibi' ? 'el recibo del IBI o escritura' : 'la factura de electricidad'}.`
      });
    }

    if (documentType === 'dniAuto') {
      extraction = normalizeIdentityExtraction(extraction);
    } else if (extraction.extractedData && typeof extraction.extractedData === 'object') {
      extraction.extractedData = normalizeExtractedStringFields(extraction.extractedData);
    }

    // CUPS validation
    if (documentType === 'electricity' && extraction.extractedData?.cups) {
      const cups = String(extraction.extractedData.cups).replace(/\s+/g, '').toUpperCase();
      extraction.extractedData.cups = cups;
      if (!cups.startsWith('ES') || cups.length < 20 || cups.length > 22)
        extraction.extractedData.cupsWarning = 'El CUPS no tiene el formato esperado.';
    }

    if (documentType === 'ibi') {
      const data = extraction.extractedData || {};
      const rcRaw = String(data.referenciaCatastral || '');
      const rc = rcRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      
      // Repeating char check: if any char repeats 4+ times consecutively in the stripped RC
      const hasRepeatingChars = /(.)\1{3,}/.test(rc);
      
      if (hasRepeatingChars) {
        data.referenciaCatastral = null;
        data.referenciaCatastralWarning = 'La referencia catastral no tiene el formato esperado.';
      } else {
        data.referenciaCatastral = rc || null;
        if (rc && rc.length !== 20) {
          data.referenciaCatastralWarning = 'La referencia catastral no tiene el formato esperado.';
        }
      }

      // If RC is null AND AI said it's correct, but titular and direccion are also null -> override
      if (!data.referenciaCatastral && extraction.isCorrectDocument && !data.titular && !data.direccion) {
        return res.json({
          success: false,
          isWrongDocument: true,
          reason: 'wrong-document',
          message: 'Documento incorrecto o incompleto. Por favor sube el recibo del IBI con todos los datos visibles.'
        });
      }
    }

    if (documentType === 'ibi' && extraction.extractedData?.direccion) {
      const sitMatch = String(extraction.extractedData.direccion).match(/\bSIT(?:UACION)?[:\s-]*([^()]+)/i);
      if (sitMatch?.[1]) {
        extraction.extractedData.direccion = sitMatch[1].trim();
      }
    }

    res.json({
      success: true,
      side: documentType === 'dniAuto' ? (extraction.side || null) : undefined,
      extraction: {
        ...extraction,
        needsManualReview: extraction.confidence < 0.75,
      },
      needsManualReview: extraction.confidence < 0.75,
      message: 'Datos extraídos correctamente.'
    });

  } catch (err) {
    console.error('AI extraction error:', err);
    res.json({ success: false, extraction: null, needsManualReview: true, reason: 'temporary-error', message: 'Error en el análisis. Inténtalo de nuevo en unos segundos.' });
  }
});

// ── Batch extraction (multiple images → single AI call) ───────────────────────────────
app.post('/api/extract-batch', aiExtractLimiter, async (req, res) => {
  const { imagesBase64, documentType } = req.body;
  if (!Array.isArray(imagesBase64) || imagesBase64.length === 0 || !documentType) {
    return res.status(400).json({ success: false, message: 'Faltan imagesBase64 o documentType.' });
  }

  const prompt = PROMPTS[documentType];
  if (!prompt) return res.status(400).json({ success: false, message: `Tipo de documento no soportado: ${documentType}` });

  const openRouterApiKey = getOpenRouterApiKey();
  if (!openRouterApiKey) {
    return res.status(503).json({ success: false, needsManualReview: true, reason: 'temporary-error', message: 'Servicio de extracción no configurado. Contacta al administrador.' });
  }

  const imageCount = imagesBase64.length;
  const batchNote = imageCount > 1
    ? `\n\nIMPORTANT: You are receiving ${imageCount} images — they are ALL pages of the SAME document. Extract and MERGE all data found across ALL pages into a single JSON response. Fields found on any page must be included in the merged result.`
    : '';

  const imageContent = imagesBase64.map(img => ({
    type: 'image_url',
    image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
  }));

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openRouterApiKey}` },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt + batchNote },
            ...imageContent
          ]
        }],
        max_tokens: 1000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[extract-batch] OpenRouter error:', response.status, errText.slice(0, 200));
      let userMessage = 'No se pudo analizar automáticamente.';
      if (response.status === 401) userMessage = 'API key de OpenRouter inválida o no configurada.';
      else if (response.status === 402) userMessage = 'Créditos de OpenRouter agotados.';
      else if (response.status === 429) userMessage = 'Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.';
      return res.json({ success: false, needsManualReview: true, reason: 'temporary-error', message: userMessage });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log(`[extract-batch:${documentType}] AI response (${imageCount} img):`, content.slice(0, 300));

    let extraction;
    try {
      const m = content.match(/\{[\s\S]*\}/);
      extraction = m ? JSON.parse(m[0]) : null;
    } catch (e) {
      console.error('[extract-batch] JSON parse error:', e.message);
      extraction = null;
    }

    if (!extraction) return res.json({ success: false, isUnreadable: true, reason: 'unreadable', message: 'No se pudo analizar las imágenes. Asegúrate de que los documentos estén bien iluminados y enfocados.' });

    if (extraction.isReadable === false) {
      return res.json({ success: false, isUnreadable: true, reason: 'unreadable', message: 'Las imágenes no son lo suficientemente claras. Asegúrate de buena iluminación, sin reflejos, y texto perfectamente enfocado.' });
    }

    if (!extraction.isCorrectDocument) {
      return res.json({ success: false, isWrongDocument: true, reason: 'wrong-document', message: `Documento incorrecto. Por favor sube ${documentType === 'electricity' ? 'la factura de electricidad' : documentType === 'ibi' ? 'el recibo del IBI o escritura' : 'el documento correcto'}.` });
    }

    if (extraction.extractedData && typeof extraction.extractedData === 'object') {
      for (const [key, value] of Object.entries(extraction.extractedData)) {
        if (typeof value === 'string') {
          extraction.extractedData[key] = value.replace(/\s+/g, ' ').trim() || null;
        }
      }
    }

    if (documentType === 'electricity' && extraction.extractedData?.cups) {
      const cups = String(extraction.extractedData.cups).replace(/\s+/g, '').toUpperCase();
      extraction.extractedData.cups = cups;
      if (!cups.startsWith('ES') || cups.length < 20 || cups.length > 22)
        extraction.extractedData.cupsWarning = 'El CUPS no tiene el formato esperado.';
    }

    if (documentType === 'ibi') {
      const data = extraction.extractedData || {};
      const rcRaw = String(data.referenciaCatastral || '');
      const rc = rcRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      
      const hasRepeatingChars = /(.)\1{3,}/.test(rc);
      
      if (hasRepeatingChars) {
        data.referenciaCatastral = null;
        data.referenciaCatastralWarning = 'La referencia catastral no tiene el formato esperado.';
      } else {
        data.referenciaCatastral = rc || null;
        if (rc && rc.length !== 20) {
          data.referenciaCatastralWarning = 'La referencia catastral no tiene el formato esperado.';
        }
      }

      if (!data.referenciaCatastral && extraction.isCorrectDocument && !data.titular && !data.direccion) {
        return res.json({ success: false, isWrongDocument: true, reason: 'wrong-document', message: 'Documento incorrecto o incompleto. Por favor sube el recibo del IBI con todos los datos visibles.' });
      }
    }

    if (documentType === 'ibi' && extraction.extractedData?.direccion) {
      const sitMatch = String(extraction.extractedData.direccion).match(/\bSIT(?:UACION)?[:\s-]*([^()]+)/i);
      if (sitMatch?.[1]) extraction.extractedData.direccion = sitMatch[1].trim();
    }

    res.json({
      success: true,
      extraction: {
        ...extraction,
        needsManualReview: extraction.confidence < 0.75,
      },
      needsManualReview: extraction.confidence < 0.75,
    });
  } catch (err) {
    console.error('[extract-batch] Unexpected error:', err);
    res.json({ success: false, needsManualReview: true, reason: 'temporary-error', message: 'Error interno. Inténtalo de nuevo en unos segundos.' });
  }
});

app.post('/api/extract-dni-batch', aiExtractLimiter, async (req, res) => {
  const { imagesBase64 } = req.body;
  if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
    return res.status(400).json({ success: false, message: 'Faltan imagesBase64.' });
  }

  const openRouterApiKey = getOpenRouterApiKey();
  if (!openRouterApiKey) {
    return res.status(503).json({ success: false, message: 'Servicio de extracción no configurado. Contacta al administrador.' });
  }

  const imageCount = imagesBase64.length;
  const imageContent = imagesBase64.map(img => ({
    type: 'image_url',
    image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
  }));

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openRouterApiKey}` },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `${PROMPTS.dniAutoBatch}\n\nAttached images: ${imageCount}. Return exactly ${imageCount} result objects.` },
            ...imageContent
          ]
        }],
        max_tokens: 1400,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[extract-dni-batch] OpenRouter error:', response.status, errText.slice(0, 200));
      let userMessage = 'No se pudo analizar automáticamente.';
      if (response.status === 401) userMessage = 'API key de OpenRouter inválida o no configurada.';
      else if (response.status === 402) userMessage = 'Créditos de OpenRouter agotados.';
      else if (response.status === 429) userMessage = 'Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.';
      return res.json({ success: false, message: userMessage });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log(`[extract-dni-batch] AI response (${imageCount} img):`, content.slice(0, 300));

    let parsed;
    try {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch (e) {
      console.error('[extract-dni-batch] JSON parse error:', e.message);
      parsed = null;
    }

    if (!parsed || !Array.isArray(parsed.results) || parsed.results.length !== imageCount) {
      return res.json({ success: false, message: 'No se pudo analizar el DNI correctamente.' });
    }

    const results = parsed.results.map((item) => {
      if (!item || typeof item !== 'object') {
        return {
          side: null,
          reason: 'temporary-error',
          message: 'No se pudo procesar el DNI.',
        };
      }

      const normalizedItem = normalizeIdentityExtraction(item);

      if (normalizedItem.isReadable === false) {
        return {
          side: normalizedItem.side || null,
          isUnreadable: true,
          reason: 'unreadable',
          message: 'La imagen no es lo suficientemente clara. Por favor, vuelve a hacer la foto con buena iluminación y texto enfocado.'
        };
      }

      if (!normalizedItem.isCorrectDocument) {
        return {
          side: normalizedItem.side || null,
          isWrongDocument: true,
          reason: 'wrong-document',
          message: 'Documento incorrecto. Por favor sube el DNI/NIE.'
        };
      }

      // Safety-net: if the AI accepted the document but couldn't extract any identity number
      // on a front page, flag for manual review so an assessor can check it.
      const isFrontSide = normalizedItem.side === 'front';
      const extractedNumber = normalizedItem.extractedData?.dniNumber;
      if (isFrontSide && !isValidIdentityNumber(extractedNumber)) {
        console.log('[extract-dni-batch] Front page accepted but no valid identity number found — flagging for manual review.');
        normalizedItem.needsManualReview = true;
        normalizedItem.confidence = Math.min(normalizedItem.confidence ?? 0.75, 0.7);
      }

      return {
        side: normalizedItem.side || null,
        extraction: {
          ...normalizedItem,
          needsManualReview: normalizedItem.confidence < 0.75,
        },
        needsManualReview: normalizedItem.confidence < 0.75,
      };
    });

    res.json({ success: true, results });
  } catch (err) {
    console.error('[extract-dni-batch] Unexpected error:', err);
    res.json({ success: false, message: 'Error interno. Inténtalo de nuevo en unos segundos.' });
  }
});

// ── PDF Generation ───────────────────────────────────────────────────────────────────

// Coordinates from RepresentationSection.tsx
const REPRESENTACIO_PAGE_SIZE = { width: 1241, height: 1754 };
const GENERALITAT_PAGE_SIZE = { width: 1357, height: 1920 };
const IVA_ES_PAGE_SIZE = { width: 1448, height: 2048 };
const PODER_ES_PAGE_SIZE = { width: 1448, height: 2048 };

const REPRESENTACIO_FIELDS = {
  personaNom: [388, 244, 812, 276],
  personaNif: [902, 244, 1095, 276],
  personaAdreca: [190, 282, 812, 314],
  personaCodiPostal: [979, 282, 1095, 314],
  personaMunicipi: [202, 321, 812, 354],
  empresaNom: [388, 438, 812, 470],
  empresaNif: [902, 438, 1095, 470],
  empresaAdreca: [190, 476, 812, 508],
  empresaCodiPostal: [979, 476, 1095, 508],
  empresaMunicipi: [202, 515, 812, 548],
  lloc: [130, 1459, 560, 1496],
  data: [725, 1459, 1100, 1496],
  signaturaPersonaInteressada: [76, 1552, 575, 1685],
};

const GENERALITAT_FIELDS = {
  nom: [146, 255, 977, 292],
  dni: [982, 255, 1295, 292],
  checkboxTitular: [147, 327, 172, 353],
  checkboxRepresentant: [459, 327, 484, 353],
  signatura: [147, 1389, 1295, 1492],
};

const IVA_ES_FIELDS = {
  sr_sra: [320, 332, 1252, 334],
  dni: [406, 395, 1195, 396],
  domicilio: [398, 455, 1195, 458],
  codigo_postal: [350, 518, 571, 520],
  localidad: [694, 518, 1237, 520],
  provincia: [315, 580, 571, 582],
  firma_aprobacion: [860, 1560, 1265, 1782],
  fecha_lugar_en: [232, 1963, 722, 1965],
  fecha_dia_el: [782, 1963, 846, 1965],
  fecha_mes: [931, 1963, 1110, 1965],
  fecha_anio_sufijo: [1256, 1963, 1306, 1965],
};

const PODER_ES_FIELDS = {
  persona_interesada_nombre_razon_social: [515, 286, 985, 322],
  persona_interesada_nif: [1038, 286, 1328, 322],
  persona_interesada_direccion: [240, 332, 985, 370],
  persona_interesada_codigo_postal: [1160, 332, 1328, 370],
  persona_interesada_municipio: [240, 380, 1328, 418],
  persona_juridica_representante_legal_nombre_razon_social: [515, 512, 985, 548],
  persona_juridica_representante_legal_nif: [1038, 512, 1328, 548],
  persona_juridica_representante_legal_direccion: [240, 558, 985, 596],
  persona_juridica_representante_legal_codigo_postal: [1160, 558, 1328, 596],
  persona_juridica_representante_legal_municipio: [240, 604, 1328, 642],
  lugar: [145, 1704, 690, 1742],
  fecha: [848, 1704, 1135, 1742],
  firma_persona_interesada: [70, 1804, 820, 1930],
};

// Helper: Convert data URL to base64
function dataUrlToBuffer(dataUrl) {
  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return null;
  return Buffer.from(matches[2], 'base64');
}

function scaleX(x, referenceWidth, actualWidth) {
  return (x / referenceWidth) * actualWidth;
}

function scaleY(y, referenceHeight, actualHeight) {
  return (y / referenceHeight) * actualHeight;
}

function scaleBox([x1, y1, x2, y2], referenceSize, actualWidth, actualHeight) {
  return {
    x: scaleX(x1, referenceSize.width, actualWidth),
    y1: scaleY(y1, referenceSize.height, actualHeight),
    y2: scaleY(y2, referenceSize.height, actualHeight),
    width: scaleX(x2 - x1, referenceSize.width, actualWidth),
    height: scaleY(y2 - y1, referenceSize.height, actualHeight),
  };
}

function scaledTextSize(baseSize, referenceWidth, actualWidth) {
  return (baseSize / referenceWidth) * actualWidth;
}

async function embedDataUrlImage(pdfDoc, dataUrl) {
  const buffer = dataUrlToBuffer(dataUrl);
  if (!buffer) return null;
  if (dataUrl.startsWith('data:image/png')) return pdfDoc.embedPng(buffer);
  return pdfDoc.embedJpg(buffer);
}

async function drawScaledSignature(page, pdfDoc, dataUrl, box, referenceSize, actualWidth, actualHeight) {
  if (!dataUrl) return;
  const image = await embedDataUrlImage(pdfDoc, dataUrl);
  if (!image) return;

  const scaled = scaleBox(box, referenceSize, actualWidth, actualHeight);
  page.drawImage(image, {
    x: scaled.x,
    y: actualHeight - scaled.y2,
    width: scaled.width,
    height: scaled.height,
  });
}

function drawScaledText(page, text, coords, referenceSize, actualWidth, actualHeight, baseSize, color) {
  if (!text) return;

  page.drawText(String(text), {
    x: scaleX(coords[0], referenceSize.width, actualWidth),
    y: actualHeight - scaleY(coords[1], referenceSize.height, actualHeight),
    size: scaledTextSize(baseSize, referenceSize.width, actualWidth),
    color,
  });
}

function drawPercentText(page, text, leftPct, topPct, actualWidth, actualHeight, size, color) {
  if (!text) return;

  page.drawText(String(text), {
    x: (leftPct / 100) * actualWidth,
    y: actualHeight - ((topPct / 100) * actualHeight),
    size,
    color,
  });
}

async function drawPercentSignature(page, pdfDoc, dataUrl, leftPct, topPct, widthPct, heightPct, actualWidth, actualHeight) {
  if (!dataUrl) return;
  const image = await embedDataUrlImage(pdfDoc, dataUrl);
  if (!image) return;

  const width = (widthPct / 100) * actualWidth;
  const height = (heightPct / 100) * actualHeight;
  const x = (leftPct / 100) * actualWidth;
  const topY = (topPct / 100) * actualHeight;

  page.drawImage(image, {
    x,
    y: actualHeight - topY - height,
    width,
    height,
  });
}

async function renderedImageToPdfBuffer(imageDataUrl) {
  if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    return null;
  }

  const imageBytes = dataUrlToBuffer(imageDataUrl);
  if (!imageBytes) return null;

  const pdfDoc = await PDFDocument.create();
  const image = imageDataUrl.startsWith('data:image/png')
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);

  const { width, height } = image.scale(1);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return Buffer.from(await pdfDoc.save());
}

// Helper: Get current date in Catalan format
function getCurrentDateCatalan() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

function getCurrentDateSpanishParts() {
  const now = new Date();
  const monthsEs = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return {
    municipalityDate: now,
    day: String(now.getDate()),
    month: monthsEs[now.getMonth()],
    yearShort: String(now.getFullYear()).slice(-2),
    yearFull: String(now.getFullYear()),
  };
}

// Generate Autorització de Representació PDF
app.post('/api/generate-representacio-pdf', async (req, res) => {
  try {
    const { persona_interessada, representant_legal, lloc, isCompany, signature } = req.body;

    // Load template image
    const templatePath = path.join(__dirname, '../app/dist/autoritzacio-representacio.jpg');
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ success: false, error: 'TEMPLATE_NOT_FOUND', message: 'Plantilla PDF no encontrada' });
    }

    const imageBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.create();
    const jpgImage = await pdfDoc.embedJpg(imageBytes);
    const { width, height } = jpgImage.scale(1);

    const page = pdfDoc.addPage([width, height]);
    page.drawImage(jpgImage, { x: 0, y: 0, width, height });

    const textColor = rgb(0.1, 0.1, 0.6);
    const textSize = 20;

    // Draw persona interessada data
    if (persona_interessada) {
      drawScaledText(page, persona_interessada.nom, REPRESENTACIO_FIELDS.personaNom, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, persona_interessada.nif, REPRESENTACIO_FIELDS.personaNif, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, persona_interessada.adreca, REPRESENTACIO_FIELDS.personaAdreca, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, persona_interessada.codi_postal, REPRESENTACIO_FIELDS.personaCodiPostal, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, persona_interessada.municipi, REPRESENTACIO_FIELDS.personaMunicipi, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
    }

    // Draw representant legal data if company
    if (isCompany && representant_legal) {
      drawScaledText(page, representant_legal.nom, REPRESENTACIO_FIELDS.empresaNom, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, representant_legal.nif, REPRESENTACIO_FIELDS.empresaNif, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, representant_legal.adreca, REPRESENTACIO_FIELDS.empresaAdreca, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, representant_legal.codi_postal, REPRESENTACIO_FIELDS.empresaCodiPostal, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, representant_legal.municipi, REPRESENTACIO_FIELDS.empresaMunicipi, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
    }

    // Draw footer
    drawScaledText(page, lloc, REPRESENTACIO_FIELDS.lloc, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
    drawScaledText(page, getCurrentDateCatalan(), REPRESENTACIO_FIELDS.data, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
    await drawScaledSignature(page, pdfDoc, signature, REPRESENTACIO_FIELDS.signaturaPersonaInteressada, REPRESENTACIO_PAGE_SIZE, width, height);

    // Generate PDF
    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="autoritzacio-representacio.pdf"');
    res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ success: false, error: 'PDF_GENERATION_ERROR', message: 'Error al generar PDF' });
  }
});

// Generate Poder de Representació PDF
app.post('/api/generate-poder-pdf', async (req, res) => {
  try {
    const { persona_interessada, representant_legal, lloc, isCompany, signature } = req.body;

    // Load template image
    const templatePath = path.join(__dirname, '../app/dist/poder-representacio.png');
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ success: false, error: 'TEMPLATE_NOT_FOUND', message: 'Plantilla PDF no encontrada' });
    }

    const imageBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.create();
    const pngImage = await pdfDoc.embedPng(imageBytes);
    const { width, height } = pngImage.scale(1);

    const page = pdfDoc.addPage([width, height]);
    page.drawImage(pngImage, { x: 0, y: 0, width, height });

    const textColor = rgb(0.1, 0.1, 0.6);
    const textSize = 20;

    // Draw persona interessada data
    if (persona_interessada) {
      drawScaledText(page, persona_interessada.nom, PODER_ES_FIELDS.persona_interesada_nombre_razon_social, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, persona_interessada.nif, PODER_ES_FIELDS.persona_interesada_nif, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, persona_interessada.adreca, PODER_ES_FIELDS.persona_interesada_direccion, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, persona_interessada.codi_postal, PODER_ES_FIELDS.persona_interesada_codigo_postal, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, persona_interessada.municipi, PODER_ES_FIELDS.persona_interesada_municipio, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
    }

    // Draw representant legal data if company
    if (isCompany && representant_legal) {
      drawScaledText(page, representant_legal.nom, PODER_ES_FIELDS.persona_juridica_representante_legal_nombre_razon_social, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, representant_legal.nif, PODER_ES_FIELDS.persona_juridica_representante_legal_nif, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, representant_legal.adreca, PODER_ES_FIELDS.persona_juridica_representante_legal_direccion, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, representant_legal.codi_postal, PODER_ES_FIELDS.persona_juridica_representante_legal_codigo_postal, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, representant_legal.municipi, PODER_ES_FIELDS.persona_juridica_representante_legal_municipio, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
    }

    // Draw footer
    drawScaledText(page, lloc, PODER_ES_FIELDS.lugar, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
    drawScaledText(page, getCurrentDateCatalan(), PODER_ES_FIELDS.fecha, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
    await drawScaledSignature(page, pdfDoc, signature, PODER_ES_FIELDS.firma_persona_interesada, PODER_ES_PAGE_SIZE, width, height);

    // Generate PDF
    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="poder-representacio.pdf"');
    res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ success: false, error: 'PDF_GENERATION_ERROR', message: 'Error al generar PDF' });
  }
});

app.post('/api/generate-image-pdf', async (req, res) => {
  try {
    const { imageDataUrl, filename } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'INVALID_IMAGE', message: 'Se requiere una imagen en formato data URL.' });
    }

    const imageBytes = dataUrlToBuffer(imageDataUrl);
    if (!imageBytes) {
      return res.status(400).json({ success: false, error: 'INVALID_IMAGE', message: 'No se pudo procesar la imagen.' });
    }

    const pdfDoc = await PDFDocument.create();
    const image = imageDataUrl.startsWith('data:image/png')
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

    const { width, height } = image.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });

    const pdfBytes = await pdfDoc.save();
    const safeFilename = typeof filename === 'string' && filename.trim() ? filename.trim() : 'documento-firmado.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Overlay PDF generation error:', err);
    res.status(500).json({ success: false, error: 'PDF_GENERATION_ERROR', message: 'Error al generar el PDF desde la imagen.' });
  }
});

// ============================================================================
// AUTOCROPPER SERVICE PROXY
// ============================================================================
const AUTOCROPPER_URL = process.env.AUTOCROPPER_URL || 'http://localhost:5001';

app.post('/api/autocropper/process', async (req, res) => {
  try {
    const { documentType, images } = req.body || {};

    if (!documentType) {
      return res.status(400).json({ success: false, error: 'INVALID_REQUEST', message: 'documentType is required' });
    }

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, error: 'INVALID_REQUEST', message: 'images array is required' });
    }

    // Forward request to autocropper service
    const response = await fetch(`${AUTOCROPPER_URL}/api/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentType, images }),
    });

    if (!response.ok) {
      console.error('Autocropper service error:', response.status, response.statusText);
      return res.status(response.status).json({
        success: false,
        error: 'AUTOCROPPER_SERVICE_ERROR',
        message: 'Error communicating with autocropper service'
      });
    }

    const result = await response.json();
    res.json(result);

  } catch (err) {
    console.error('Autocropper proxy error:', err);
    res.status(500).json({ success: false, error: 'AUTOCROPPER_ERROR', message: 'Error procesando documento' });
  }
});

app.get('/api/autocropper/health', async (req, res) => {
  try {
    const response = await fetch(`${AUTOCROPPER_URL}/health`);
    if (response.ok) {
      const health = await response.json();
      res.json({ ...health, proxy: 'connected' });
    } else {
      res.status(503).json({ status: 'unavailable', service: 'autocropper', proxy: 'disconnected' });
    }
  } catch (err) {
    res.status(503).json({ status: 'error', service: 'autocropper', proxy: 'error' });
  }
});

// Serve frontend in production, proxy to Vite dev server in development
const distPath = path.join(__dirname, '../app/dist');

if (isProduction) {
  // Production: Serve static files from built frontend
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Development: Proxy to Vite dev server
  app.use('/', createProxyMiddleware({
    target: 'http://localhost:5000',
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
  }));
}

// ── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = isProduction ? 'Internal server error' : (err.message || 'Internal server error');
  console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${err.message}`);
  if (!res.headersSent) {
    res.status(status).json({ success: false, error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (isProduction) {
    console.log('✅ Production mode: serving frontend from dist/');
  } else {
    console.log('🔧 Development mode: proxying to Vite on port 5000');
  }
  const testCodes = ['ELT20250001', 'ELT20250002', 'ELT20250003', 'ELT20250004', 'ELT20250005'];
  const availableTestProjects = testCodes
    .map((code) => database.projects[code])
    .filter(Boolean);

  if (!isProduction && availableTestProjects.length > 0) {
    console.log('Test codes: ELT20250001 (solar) | ELT20250002 (aerothermal) | ELT20250003 (solar) | ELT20250004 (solar-ec) | ELT20250005 (ec-flow)');
    console.log('Test phones: +34612345678 | +34623456789 | +34655443322 | +34666000004 | +34666000005');
    availableTestProjects.forEach((project) => {
      console.log(`🔗 ${project.code}: /?code=${project.code}`);
    });
  }
});

if (isProduction && PORT !== LEGACY_COMPAT_PORT) {
  const compatServer = app.listen(LEGACY_COMPAT_PORT, () => {
    console.log(`✅ Legacy compatibility listener active on http://localhost:${LEGACY_COMPAT_PORT}`);
  });
  compatServer.on('error', (error) => {
    console.warn(`⚠️  Failed to bind legacy compatibility port ${LEGACY_COMPAT_PORT}: ${error.message}`);
  });
}
