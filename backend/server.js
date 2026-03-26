const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { PDFDocument, rgb } = require('pdf-lib');
const AdmZip = require('adm-zip');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

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

// OpenRouter API config — key loaded from environment
const initialOpenRouterApiKey = getOpenRouterApiKey();
if (!initialOpenRouterApiKey) {
  console.warn('⚠️  OPENROUTER_API_KEY not set in .env — AI extraction will fail');
  console.warn(`   Checked: ${ENV_PATHS.join(' | ')}`);
} else {
  console.log('✅ OPENROUTER_API_KEY loaded:', initialOpenRouterApiKey.slice(0, 8) + '...');
}
const OPENROUTER_MODEL = 'google/gemini-3.1-flash-lite-preview';

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'x-dashboard-token', 'x-project-token'] }));
app.use(express.json({ limit: '25mb' }));
app.use(express.static('uploads'));

// Uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── File-based persistence ──────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'db.json');

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

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving DB:', e.message);
  }
}

function getDefaultProjects() {
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
    }
  };
}

const database = loadDB();

// ── IDOR: Assign access tokens to any project that lacks one ───────────────────
function assignMissingTokens() {
  let changed = false;
  for (const project of Object.values(database.projects)) {
    if (!project.accessToken) {
      project.accessToken = uuidv4();
      changed = true;
    }
  }
  if (changed) {
    saveDB();
    console.log('🔑 Access tokens assigned to existing projects.');
  }
}
assignMissingTokens();

// ── IDOR: Validate project access token ────────────────────────────────────────
function requireProjectToken(req, res, next) {
  const code = req.params.code;
  const project = database.projects[code];
  if (!project) return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND', message: 'Proyecto no encontrado.' });

  // If project has an accessToken, the request must present it
  if (project.accessToken) {
    const requestToken = req.headers['x-project-token'];
    if (!requestToken || requestToken !== project.accessToken) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Acceso no autorizado a este proyecto.' });
    }
  }

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

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalizePhone(p) {
  if (!p) return '';
  return p.replace(/[\s\-().]/g, '').replace(/^0034/, '+34').replace(/^(?=\d{9}$)/, '+34').replace(/^34(?=\d{9}$)/, '+34');
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
  const representation = formData?.representation || {};

  return {
    location: getEffectiveLocation(formData),
    dniFront,
    dniBack,
    ibi,
    electricityData: eb,
    representation,
    fullName: dniFront.fullName || eb.titular || ibi.titular || '',
    dniNumber: dniFront.dniNumber || eb.nifTitular || ibi.titularNif || '',
    address: eb.direccionSuministro || dniBack.address || ibi.direccion || '',
    municipality: eb.municipio || dniBack.municipality || ibi.municipio || '',
    // Province: electricity bill only (IBI and DNI excluded by design)
    province: eb.provincia || '',
    postalCode: eb.codigoPostal || ibi.codigoPostal || representation.postalCode || '',
  };
}

function buildDashboardSummary(project) {
  const formData = project?.formData || null;
  const snapshot = getProjectSnapshot(formData);
  const location = snapshot.location;
  const representation = formData?.representation || {};
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
        label: `Factura luz (pág. ${i + 1})`,
        present: !!page?.photo?.preview,
        needsManualReview: !!page?.extraction?.needsManualReview,
      }))
    : [{ key: 'electricity_0', label: 'Factura de luz', present: false, needsManualReview: false }];

  const documents = [
    {
      key: 'dniFront',
      label: 'DNI frontal',
      present: !!formData?.dni?.front?.photo?.preview,
      needsManualReview: !!formData?.dni?.front?.extraction?.needsManualReview,
    },
    {
      key: 'dniBack',
      label: 'DNI trasera',
      present: !!formData?.dni?.back?.photo?.preview,
      needsManualReview: !!formData?.dni?.back?.extraction?.needsManualReview,
    },
    {
      key: 'ibi',
      label: 'IBI / Escritura',
      present: !!formData?.ibi?.photo?.preview,
      needsManualReview: !!formData?.ibi?.extraction?.needsManualReview,
    },
    ...electricityDocs,
  ];

  const signedForms = [];
  const generatedPdfs = [];

  if (location === 'cataluna') {
    signedForms.push(
      { key: 'ivaCat', label: 'IVA 10% Cataluña', present: !!representation.ivaCertificateSignature },
      { key: 'generalitat', label: 'Declaració Generalitat', present: !!representation.generalitatSignature },
      { key: 'representacioCat', label: 'Autorització de representació', present: !!representation.representacioSignature }
    );
    generatedPdfs.push(
      { key: 'ivaCatPdf', label: 'PDF IVA Cataluña', available: !!representation.ivaCertificateSignature },
      { key: 'generalitatPdf', label: 'PDF Generalitat', available: !!representation.generalitatSignature },
      { key: 'representacioPdf', label: 'PDF Autorització', available: !!representation.representacioSignature }
    );
  } else if (location === 'madrid' || location === 'valencia') {
    signedForms.push(
      { key: 'ivaEs', label: 'IVA 10% España', present: !!representation.ivaCertificateEsSignature },
      { key: 'poderEs', label: 'Poder de representación', present: !!representation.poderRepresentacioSignature }
    );
    generatedPdfs.push(
      { key: 'ivaEsPdf', label: 'PDF IVA España', available: !!representation.ivaCertificateEsSignature },
      { key: 'poderEsPdf', label: 'PDF Poder', available: !!representation.poderRepresentacioSignature }
    );
  }

  const finalSignatures = [
    { key: 'customer', label: 'Firma cliente', present: !!formData?.signatures?.customerSignature },
    { key: 'advisor', label: 'Firma comercial', present: !!formData?.signatures?.repSignature },
  ];

  return {
    lastUpdated:
      project?.lastActivity
      || (project?.submissions?.length ? project.submissions[project.submissions.length - 1].timestamp : null)
      || project?.createdAt
      || null,
    location,
    address: snapshot.address || null,
    displayAddress,
    postalCode: snapshot.postalCode || null,
    municipality: snapshot.municipality || null,
    province: snapshot.province || null,
    documents,
    signedForms,
    generatedPdfs,
    finalSignatures,
    counts: {
      documentsPresent: documents.filter(d => d.present).length,
      documentsTotal: documents.length,
      manualReview: documents.filter(d => d.needsManualReview).length,
      signedFormsPresent: signedForms.filter(d => d.present).length,
      signedFormsTotal: signedForms.length,
      pdfsAvailable: generatedPdfs.filter(d => d.available).length,
      pdfsTotal: generatedPdfs.length,
      finalSignaturesPresent: finalSignatures.filter(d => d.present).length,
      finalSignaturesTotal: finalSignatures.length,
    }
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

// Get project by code (public read — code alone is sufficient as identifier)
app.get('/api/project/:code', (req, res) => {
  const code = req.params.code;
  const project = database.projects[code];
  if (!project) return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND', message: 'Proyecto no encontrado.' });
  res.json({ success: true, project });
});

// Look up project by phone number
app.get('/api/lookup/phone/:phone', (req, res) => {
  const needle = normalizePhone(decodeURIComponent(req.params.phone));
  const project = Object.values(database.projects).find(p => normalizePhone(p.phone) === needle);
  if (!project) return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'No encontramos ningún proyecto con ese teléfono. Contacta con tu asesor.' });
  res.json({ success: true, project });
});

// Create new project (SSR flow — phone number not yet in system)
app.post('/api/project/create', (req, res) => {
  const { phone, customerName, email, productType, assessor, assessorId } = req.body;

  if (!phone) return res.status(400).json({ success: false, message: 'El número de teléfono es obligatorio.' });

  const normalizedPhone = normalizePhone(phone);

  // Check for duplicate
  const existing = Object.values(database.projects).find(p => normalizePhone(p.phone) === normalizedPhone);
  if (existing) {
    return res.json({ success: true, project: existing, existing: true });
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

  res.json({ success: true, project, existing: false });
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

// Auto-save progress (requires access token)
app.post('/api/project/:code/save', requireProjectToken, (req, res) => {
  const project = req.project;
  project.formData = req.body.formData;
  project.lastActivity = new Date().toISOString();
  // Update customer name from DNI extraction if available
  const dniName = req.body.formData?.dni?.front?.extraction?.extractedData?.fullName;
  if (dniName) project.customerName = dniName;

  // Check if Catalonia PDFs can be generated
  const pdfStatus = checkCataloniaPDFs(req.body.formData);
  project.cataloniaPDFs = pdfStatus;

  saveDB();
  res.json({ success: true, message: 'Progreso guardado.', cataloniaPDFs: pdfStatus });
});

// Final submit (requires access token)
app.post('/api/project/:code/submit', requireProjectToken, (req, res) => {
  const project = req.project;
  const submission = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    source: req.body.source || 'customer',
    ipAddress: req.ip,
    formData: req.body.formData
  };
  project.submissions.push(submission);
  project.formData = req.body.formData;
  project.lastActivity = new Date().toISOString();
  // Update customer name from DNI extraction if available
  const dniName = req.body.formData?.dni?.front?.extraction?.extractedData?.fullName;
  if (dniName) project.customerName = dniName;

  // Check if Catalonia PDFs can be generated
  const pdfStatus = checkCataloniaPDFs(req.body.formData);
  project.cataloniaPDFs = pdfStatus;

  saveDB();
  res.json({ success: true, message: 'Documentación enviada correctamente.', submissionId: submission.id, cataloniaPDFs: pdfStatus });
});

// Upload file
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió archivo.' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, fileUrl, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
});

// ── Dashboard auth ─────────────────────────────────────────────────────────────
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'eltex2025'; // override via .env
const dashboardSessions = new Set();

app.post('/api/dashboard/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Contraseña requerida.' });
  if (password !== DASHBOARD_PASSWORD) return res.status(401).json({ success: false, message: 'Contraseña incorrecta.' });
  const token = uuidv4();
  dashboardSessions.add(token);
  res.json({ success: true, token });
});

app.post('/api/dashboard/logout', (req, res) => {
  const token = req.headers['x-dashboard-token'];
  if (token) dashboardSessions.delete(token);
  res.json({ success: true });
});

function requireDashboardAuth(req, res, next) {
  const token = req.headers['x-dashboard-token'];
  if (!token || !dashboardSessions.has(token)) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Acceso no autorizado.' });
  }
  next();
}

// ── Dashboard endpoint ─────────────────────────────────────────────────────────
app.get('/api/dashboard', requireDashboardAuth, (req, res) => {
  const projects = Object.values(database.projects).map(p => ({
    code: p.code,
    customerName: p.customerName,
    phone: p.phone,
    email: p.email,
    productType: p.productType,
    assessor: p.assessor,
    createdAt: p.createdAt,
    lastActivity: p.lastActivity,
    submissionCount: p.submissions.length,
    latestSubmission: p.submissions.length > 0 ? p.submissions[p.submissions.length - 1] : null,
    formData: p.formData,
    summary: buildDashboardSummary(p),
    cataloniaPDFs: p.cataloniaPDFs || { canGenerateRepresentacio: false, canGeneratePoder: false },
  })).sort((a, b) => {
    const leftDate = new Date(a.summary?.lastUpdated || 0).getTime();
    const rightDate = new Date(b.summary?.lastUpdated || 0).getTime();
    return rightDate - leftDate;
  });
  res.json({ success: true, projects });
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

// ── Download all project files as a ZIP ───────────────────────────────────────
app.get('/api/project/:code/download-zip', requireDashboardAuth, (req, res) => {
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

  if (fd) {
    addBase64File('DNI_frontal', fd.dni?.front?.photo?.preview, '1_documentos');
    addBase64File('DNI_trasera', fd.dni?.back?.photo?.preview, '1_documentos');
    addBase64File('IBI', fd.ibi?.photo?.preview, '1_documentos');

    const getElecPages = (formData) => {
      const eb = formData.electricityBill;
      if (Array.isArray(eb?.pages)) return eb.pages;
      if (Array.isArray(eb)) return eb;
      return [];
    };
    getElecPages(fd).forEach((page, i) => {
      addBase64File(`Factura_luz_${i + 1}`, page?.photo?.preview, '1_documentos');
    });

    (fd.electricalPanel?.photos || []).forEach((p, i) => addBase64File(`Cuadro_electrico_${i + 1}`, p?.preview, '2_fotos_instalacion'));
    (fd.roof?.photos || []).forEach((p, i) => addBase64File(`Tejado_${i + 1}`, p?.preview, '2_fotos_instalacion'));
    (fd.installationSpace?.photos || []).forEach((p, i) => addBase64File(`Espacio_instalacion_${i + 1}`, p?.preview, '2_fotos_instalacion'));
    (fd.radiators?.photos || []).forEach((p, i) => addBase64File(`Radiadores_${i + 1}`, p?.preview, '2_fotos_instalacion'));
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

  if (fd) {
    addDataUrlFile('DNI_frontal', fd.dni?.front?.photo?.preview, 'document');
    addDataUrlFile('DNI_trasera', fd.dni?.back?.photo?.preview, 'document');
    addDataUrlFile('IBI', fd.ibi?.photo?.preview, 'document');
    getElectricityPages(fd).forEach((page, index) => {
      addDataUrlFile(`Factura_luz_${index + 1}`, page?.photo?.preview, 'document');
    });
    addDataUrlFile('Firma_iva_cat', fd.representation?.ivaCertificateSignature, 'signed-form-signature');
    addDataUrlFile('Firma_generalitat', fd.representation?.generalitatSignature, 'signed-form-signature');
    addDataUrlFile('Firma_representacio_cat', fd.representation?.representacioSignature, 'signed-form-signature');
    addDataUrlFile('Firma_iva_es', fd.representation?.ivaCertificateEsSignature, 'signed-form-signature');
    addDataUrlFile('Firma_poder_es', fd.representation?.poderRepresentacioSignature, 'signed-form-signature');
    addDataUrlFile('Firma_cliente', fd.signatures?.customerSignature, 'final-signature');
    addDataUrlFile('Firma_comercial', fd.signatures?.repSignature, 'final-signature');

    (fd.electricalPanel?.photos || []).forEach((photo, index) => addDataUrlFile(`Cuadro_electrico_${index + 1}`, photo?.preview, 'property-photo'));
    (fd.roof?.photos || []).forEach((photo, index) => addDataUrlFile(`Tejado_${index + 1}`, photo?.preview, 'property-photo'));
    (fd.installationSpace?.photos || []).forEach((photo, index) => addDataUrlFile(`Espacio_instalacion_${index + 1}`, photo?.preview, 'property-photo'));
    (fd.radiators?.photos || []).forEach((photo, index) => addDataUrlFile(`Radiadores_${index + 1}`, photo?.preview, 'property-photo'));
  }

  res.json({ success: true, projectCode: project.code, customerName: project.customerName, files });
});

// ── PDF → Images via Stirling-PDF API ──────────────────────────────────────────
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const STIRLING_PDF_URL = 'https://s-pdf-production-ed78.up.railway.app/api/v1/convert/pdf/img';

function getStirlingApiKey() {
  const key = process.env.STIRLING_PDF_API_KEY;
  if (key) return key;
  loadEnvFiles();
  return process.env.STIRLING_PDF_API_KEY || null;
}

app.post('/api/pdf-to-images', pdfUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún archivo PDF.' });
    }

    const apiKey = getStirlingApiKey();
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'Servicio de conversión de PDF no configurado.' });
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
    addField('dpi', '150');

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
        'X-API-KEY': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyParts,
    });

    if (!stirlingRes.ok) {
      const errText = await stirlingRes.text().catch(() => '');
      console.error(`[pdf-to-images] Stirling-PDF error ${stirlingRes.status}:`, errText.slice(0, 200));
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
    res.status(500).json({ success: false, message: 'Error inesperado al convertir el PDF.' });
  }
});

// ── AI Document Extraction ─────────────────────────────────────────────────────
const PROMPTS = {
  dniFront: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

Extract from the FRONT of a Spanish DNI or NIE:
1. Full name (apellidos + nombre exactly as printed)
2. DNI/NIE number (e.g. 12345678A or X1234567A) — must be fully visible
3. Date of birth — YYYY-MM-DD
4. Expiry date — YYYY-MM-DD
5. Sex (M or F)

If this is NOT a DNI/NIE front, set isCorrectDocument: false.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"DNI front","isReadable":true,"extractedData":{"fullName":"string or null","dniNumber":"string or null","dateOfBirth":"string or null","expiryDate":"string or null","sex":"M or F or null","nationality":"string or null"},"confidence":0.95,"notes":"string"}`,

  dniBack: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

Extract from the BACK of a Spanish DNI:
1. Full address (domicilio) — street, number, floor, door — every character must be readable
2. Municipality (municipio/localidad)
3. Province (provincia)
4. Place of birth (lugar de nacimiento)

If this is NOT a DNI back, set isCorrectDocument: false.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"DNI back","isReadable":true,"extractedData":{"address":"string or null","municipality":"string or null","province":"string or null","placeOfBirth":"string or null"},"confidence":0.95,"notes":"string"}`,

  ibi: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

Extract from a Spanish IBI receipt, property-tax debit notice, or Escritura:
1. Referencia Catastral — exactly 20 alphanumeric characters, must be complete and clear
2. Titular (property owner full name)
3. NIF del titular if visible
4. Full property address (dirección del inmueble) only. Do NOT include RC/reference, tax year, amount, payment text, or summary labels in this field.
5. Código postal if visible
6. Municipality / province if visible
7. Tax year / ejercicio or charge date if visible
8. Total amount if visible

If this is clearly NOT an IBI/property-tax/escritura document, set isCorrectDocument: false.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"IBI receipt","isReadable":true,"extractedData":{"referenciaCatastral":"string or null","titular":"string or null","titularNif":"string or null","direccion":"string or null","codigoPostal":"string or null","municipio":"string or null","provincia":"string or null","ejercicio":"string or null","importe":"string or null"},"confidence":0.95,"notes":"string"}`,

  electricity: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

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

Only set isCorrectDocument: false if the image is clearly NOT an electricity bill (e.g., DNI, IBI, passport, bank statement, unrelated document).

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"electricity bill","isReadable":true,"extractedData":{"titular":"string or null","nifTitular":"string or null","direccionSuministro":"string or null","codigoPostal":"string or null","municipio":"string or null","provincia":"string or null","cups":"string or null","potenciaContratada":"string or null","tipoFase":"monofasica or trifasica or null","tarifaAcceso":"string or null","comercializadora":"string or null","distribuidora":"string or null","fechaFactura":"string or null","periodoFacturacion":"string or null","importe":"string or null"},"confidence":0.95,"notes":"string"}`,

  dniAuto: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

You are analyzing a Spanish DNI (Documento Nacional de Identidad) or NIE (Número de Identidad de Extranjero) — any side.

STEP 1: Determine the side:
- FRONT (anverso): Has a person's PHOTO, full name, DNI/NIE number, date of birth (fecha de nacimiento), expiry date (válido hasta), sex (M/F), nationality
- BACK (reverso): Has home address (domicilio), municipality (municipio), province (provincia), place of birth (lugar de nacimiento), and usually an MRZ strip at the bottom

STEP 2: Set "side" to "front" or "back" and extract the appropriate fields. Fields not present on that side must be null.

If this is NOT a DNI/NIE at all, set isCorrectDocument: false.

For the FRONT, respond with:
{"side":"front","isCorrectDocument":true,"documentTypeDetected":"DNI front","isReadable":true,"extractedData":{"fullName":"string or null","dniNumber":"string or null","dateOfBirth":"YYYY-MM-DD or null","expiryDate":"YYYY-MM-DD or null","sex":"M or F or null","nationality":"string or null","address":null,"municipality":null,"province":null,"placeOfBirth":null},"confidence":0.95,"notes":"string"}

For the BACK, respond with:
{"side":"back","isCorrectDocument":true,"documentTypeDetected":"DNI back","isReadable":true,"extractedData":{"fullName":null,"dniNumber":null,"dateOfBirth":null,"expiryDate":null,"sex":null,"nationality":null,"address":"string or null","municipality":"string or null","province":"string or null","placeOfBirth":"string or null"},"confidence":0.95,"notes":"string"}

Respond ONLY with this exact JSON (no markdown, no extra text).`
};


app.post('/api/extract', async (req, res) => {
  const { imageBase64, documentType } = req.body;
  if (!imageBase64 || !documentType) return res.status(400).json({ success: false, message: 'Faltan imageBase64 o documentType.' });

  const prompt = PROMPTS[documentType];
  if (!prompt) return res.status(400).json({ success: false, message: `Tipo de documento no soportado: ${documentType}` });

  const openRouterApiKey = getOpenRouterApiKey();
  if (!openRouterApiKey) {
    return res.status(503).json({ success: false, isUnreadable: false, needsManualReview: true, reason: 'temporary-error', message: 'Servicio de extracción no configurado. Contacta al administrador.' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openRouterApiKey}` },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
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

    if (extraction.extractedData && typeof extraction.extractedData === 'object') {
      for (const [key, value] of Object.entries(extraction.extractedData)) {
        if (typeof value === 'string') {
          const normalized = value.replace(/\s+/g, ' ').trim();
          extraction.extractedData[key] = normalized || null;
        }
      }
    }

    // CUPS validation
    if (documentType === 'electricity' && extraction.extractedData?.cups) {
      const cups = String(extraction.extractedData.cups).replace(/\s+/g, '').toUpperCase();
      extraction.extractedData.cups = cups;
      if (!cups.startsWith('ES') || cups.length < 20 || cups.length > 22)
        extraction.extractedData.cupsWarning = 'El CUPS no tiene el formato esperado.';
    }

    if (documentType === 'ibi' && extraction.extractedData?.referenciaCatastral) {
      const referenciaCatastral = String(extraction.extractedData.referenciaCatastral).replace(/[^A-Z0-9]/gi, '').toUpperCase();
      extraction.extractedData.referenciaCatastral = referenciaCatastral || null;
      if (referenciaCatastral && referenciaCatastral.length !== 20) {
        extraction.extractedData.referenciaCatastralWarning = 'La referencia catastral no tiene el formato esperado.';
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
app.post('/api/extract-batch', async (req, res) => {
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

    if (documentType === 'ibi' && extraction.extractedData?.referenciaCatastral) {
      const rc = String(extraction.extractedData.referenciaCatastral).replace(/[^A-Z0-9]/gi, '').toUpperCase();
      extraction.extractedData.referenciaCatastral = rc || null;
      if (rc && rc.length !== 20)
        extraction.extractedData.referenciaCatastralWarning = 'La referencia catastral no tiene el formato esperado.';
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

// Serve frontend in production, proxy to Vite dev server in development
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT !== undefined;
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
    target: 'http://localhost:5173',
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
  }));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (isProduction) {
    console.log('✅ Production mode: serving frontend from dist/');
  } else {
    console.log('🔧 Development mode: proxying to Vite on port 5173');
  }
  console.log('Test codes: ELT20250001 (solar) | ELT20250002 (aerothermal) | ELT20250003 (solar)');
  console.log('Test phones: +34612345678 | +34623456789 | +34655443322');
  const testCodes = ['ELT20250001', 'ELT20250002', 'ELT20250003'];
  testCodes.forEach(code => {
    const p = database.projects[code];
    if (p?.accessToken) {
      console.log(`🔗 ${code}: /?code=${code}&token=${p.accessToken}`);
    }
  });
});
