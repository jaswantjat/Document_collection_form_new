const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const {
  attachViteDevProxyUpgrade,
  createViteDevProxyMiddleware,
} = require('./lib/viteDevProxy');
const {
  deleteAssetFiles,
  normalizeActiveAssetKeys,
  pruneManagedAssetFiles,
} = require('./lib/assetFiles');
const { configureTrustProxy } = require('./lib/trustProxy');
const {
  beginSubmissionAttempt,
  completeSubmissionAttempt,
  failSubmissionAttempt,
} = require('./lib/submissionAttempts');
const { getSpaFallbackResponseKind } = require('./lib/spaFallback');
const {
  DEFAULT_TEST_CODES,
  ensureDefaultTestProjects,
  getDefaultProjects,
} = require('./lib/testProjects');
const {
  createDashboardProjectRecord,
  findProjectByNormalizedPhone,
  normalizeDashboardCreateInput,
  serializeDashboardProjectAction,
  validateDashboardCreateInput,
} = require('./lib/dashboardProjectManagement');
const { isApprovedAssessor } = require('./lib/approvedAssessors');
const { registerGracefulShutdown } = require('./lib/gracefulShutdown');
const {
  buildDashboardSummary,
  getElectricityPages,
  getIbiPages,
  getProjectSnapshot,
} = require('./lib/dashboardSummary');
const { registerProjectRoutes } = require('./lib/projectRoutes');
const { registerDashboardRoutes } = require('./lib/dashboardRoutes');
const { registerPdfConversionRoutes } = require('./lib/pdfConversionRoutes');
const { registerExtractionRoutes } = require('./lib/extractionRoutes');
const { registerTestSupportRoutes } = require('./lib/testSupportRoutes');
const {
  registerPdfGenerationRoutes,
  renderedImageToPdfBuffer,
} = require('./lib/pdfGenerationRoutes');
const { registerAutocropperRoutes } = require('./lib/autocropperRoutes');

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
  return refreshedKey && refreshedKey !== 'your_openrouter_api_key_here'
    ? refreshedKey
    : null;
}

function getStirlingApiKey() {
  const key = process.env.STIRLING_PDF_API_KEY;
  if (key) return key;
  loadEnvFiles();
  return process.env.STIRLING_PDF_API_KEY || null;
}

loadEnvFiles();

const isProduction =
  process.env.NODE_ENV === 'production'
  || process.env.RAILWAY_ENVIRONMENT !== undefined;
const trustProxy = configureTrustProxy(app, {
  railwayEnvironment: process.env.RAILWAY_ENVIRONMENT,
  trustProxyEnv: process.env.TRUST_PROXY,
});
const LEGACY_DOCFLOW_WEBHOOK_SECRET =
  process.env.ELTEX_DOCFLOW_WEBHOOK_SECRET || 'eltex-docflow-2026-v1';
const FORM_NOTIFICATIONS_WEBHOOK_SECRET =
  process.env.ELTEX_FORM_NOTIFICATIONS_WEBHOOK_SECRET || LEGACY_DOCFLOW_WEBHOOK_SECRET;
const DATA_DIR =
  process.env.DATA_DIR
  || (process.env.RAILWAY_ENVIRONMENT ? '/data' : __dirname);
const uploadDir = path.join(DATA_DIR, 'uploads');
const assetUploadDir = path.join(DATA_DIR, 'uploads', 'assets');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite-preview';
const STIRLING_PDF_URL =
  process.env.STIRLING_PDF_URL
  || 'https://s-pdf-production-ed78.up.railway.app/api/v1/convert/pdf/img';
const AUTOCROPPER_URL = process.env.AUTOCROPPER_URL || 'http://localhost:5001';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(assetUploadDir, { recursive: true });

const initialOpenRouterApiKey = getOpenRouterApiKey();
if (!initialOpenRouterApiKey) {
  console.warn('⚠️  OPENROUTER_API_KEY not set in .env — AI extraction will fail');
  console.warn(`   Checked: ${ENV_PATHS.join(' | ')}`);
} else {
  console.log(
    '✅ OPENROUTER_API_KEY loaded:',
    `${initialOpenRouterApiKey.slice(0, 8)}...`
  );
}
if (trustProxy !== false) {
  console.log(`✅ Express trust proxy configured: ${String(trustProxy)}`);
}

if (isProduction) {
  const required = ['OPENROUTER_API_KEY', 'DASHBOARD_PASSWORD'];
  const missing = required.filter(
    (key) => !process.env[key] || process.env[key] === 'your_openrouter_api_key_here'
  );
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Server cannot start in production without these values.');
    process.exit(1);
  }
}

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

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : null;

app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: allowedOrigins
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
      : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-dashboard-token',
      'x-project-token',
    ],
  })
);
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(uploadDir));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'document-collection-backend',
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development',
  });
});

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const changed = ensureDefaultTestProjects(parsed, {
        isProduction,
        seedSampleData: process.env.SEED_SAMPLE_DATA,
      });
      if (changed) {
        fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
      }
      return parsed;
    }
  } catch (error) {
    console.error('Error loading DB, starting fresh:', error.message);
  }

  return {
    projects: getDefaultProjects({
      isProduction,
      seedSampleData: process.env.SEED_SAMPLE_DATA,
    }),
  };
}

let saveDBWriting = false;
let saveDBDirty = false;
function saveDB() {
  saveDBDirty = true;
  if (saveDBWriting) return;

  function doWrite() {
    if (!saveDBDirty) return;
    saveDBDirty = false;
    saveDBWriting = true;
    const snapshot = JSON.stringify(database, null, 2);
    fs.writeFile(DB_FILE, snapshot, 'utf8', (err) => {
      saveDBWriting = false;
      if (err) {
        console.error('Error saving DB:', err.message);
      }
      if (saveDBDirty) {
        doWrite();
      }
    });
  }

  setImmediate(doWrite);
}

const database = loadDB();

function buildCustomerProjectUrl(code) {
  const params = new URLSearchParams({ code });
  return `/?${params.toString()}`;
}

function requireProject(req, res, next) {
  const code = req.params.code;
  const project = database.projects[code];
  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'PROJECT_NOT_FOUND',
      message: 'Proyecto no encontrado.',
    });
  }

  req.project = project;
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname);
    callback(null, `${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error('Solo se aceptan JPG, PNG y PDF.'));
    }
  },
});

const PROPERTY_PHOTO_ASSET_KEYS = ['electricalPanel', 'roof', 'installationSpace', 'radiators'];
function buildIndexedAssetFields(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}_${index}`,
    maxCount: 1,
  }));
}

const ASSET_FIELDS = [
  { name: 'dniFront', maxCount: 1 },
  { name: 'dniBack', maxCount: 1 },
  ...buildIndexedAssetFields('ibi', 5),
  ...buildIndexedAssetFields('electricity', 5),
  ...buildIndexedAssetFields('bankDocument', 25),
  ...PROPERTY_PHOTO_ASSET_KEYS.flatMap((key) => buildIndexedAssetFields(key, 20)),
  { name: 'energyCert', maxCount: 1 },
  ...buildIndexedAssetFields('dniOriginal', 5),
  ...buildIndexedAssetFields('ibiOriginal', 5),
  ...buildIndexedAssetFields('electricityOriginal', 5),
];

const assetStorage = multer.diskStorage({
  destination: (req, _file, callback) => {
    const dir = path.join(assetUploadDir, req.project?.code || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename: (_req, file, callback) => {
    const ext =
      path.extname(file.originalname)
      || (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
    callback(null, `${file.fieldname}${ext}`);
  },
});

const assetUpload = multer({
  storage: assetStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/pdf',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error('Solo se aceptan JPG, PNG y PDF.'));
    }
  },
});

function normalizePhone(phone) {
  if (!phone) return '';
  let clean = phone.replace(/[\s\-().]/g, '');
  if (/^00\d/.test(clean)) clean = `+${clean.slice(2)}`;
  if (/^34\d{9}$/.test(clean)) return `+${clean}`;
  if (/^\d{9}$/.test(clean) && /^[6-9]/.test(clean)) return `+34${clean}`;
  return clean;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTestSubmitDelayMs(req) {
  if (isProduction) return 0;
  const rawValue = req.get('x-test-submit-delay-ms');
  const delayMs = Number(rawValue);
  if (!Number.isFinite(delayMs) || delayMs <= 0) return 0;
  return Math.min(delayMs, 5000);
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
    cataloniaPDFs: project.cataloniaPDFs || {
      canGenerateRepresentacio: false,
      canGeneratePoder: false,
    },
  };
}

function generateProjectCode() {
  const year = new Date().getFullYear();
  const existing = Object.keys(database.projects).filter((key) => key.startsWith(`ELT${year}`));
  const maxNum = existing.reduce((max, key) => {
    const current = parseInt(key.replace(`ELT${year}`, ''), 10);
    return Number.isNaN(current) ? max : Math.max(max, current);
  }, 0);
  return `ELT${year}${String(maxNum + 1).padStart(4, '0')}`;
}

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
    return res.status(503).json({
      success: false,
      message: 'Dashboard login is not configured.',
    });
  }

  const clientIp = req.ip || 'unknown';
  const attempts = getLoginAttemptEntry(clientIp);
  if (attempts.count >= DASHBOARD_LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Demasiados intentos. Inténtalo de nuevo más tarde.',
    });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'Contraseña requerida.' });
  }
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
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Acceso no autorizado.',
    });
  }
  if (expiresAt <= Date.now()) {
    dashboardSessions.delete(token);
    return res.status(401).json({
      success: false,
      error: 'SESSION_EXPIRED',
      message: 'La sesión del dashboard ha caducado.',
    });
  }

  next();
}

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

registerProjectRoutes({
  app,
  database,
  saveDB,
  isProduction,
  requireProject,
  requireDashboardAuth,
  normalizePhone,
  serializeProject,
  generateProjectCode,
  buildCustomerProjectUrl,
  isApprovedAssessor,
  beginSubmissionAttempt,
  completeSubmissionAttempt,
  failSubmissionAttempt,
  getTestSubmitDelayMs,
  sleep,
  assetUpload,
  ASSET_FIELDS,
  normalizeActiveAssetKeys,
  pruneManagedAssetFiles,
  deleteAssetFiles,
  DATA_DIR,
  upload,
  FORM_NOTIFICATIONS_WEBHOOK_SECRET,
  LEGACY_DOCFLOW_WEBHOOK_SECRET,
  getProjectSnapshot,
});

registerDashboardRoutes({
  app,
  database,
  saveDB,
  requireDashboardAuth,
  normalizePhone,
  serializeProject,
  serializeDashboardProject,
  generateProjectCode,
  createDashboardProjectRecord,
  findProjectByNormalizedPhone,
  normalizeDashboardCreateInput,
  serializeDashboardProjectAction,
  validateDashboardCreateInput,
  assetUploadDir,
  DATA_DIR,
  getProjectSnapshot,
  getIbiPages,
  getElectricityPages,
  renderedImageToPdfBuffer,
  uuidv4,
});

registerPdfConversionRoutes({
  app,
  pdfLimiter,
  pdfUpload,
  STIRLING_PDF_URL,
  getStirlingApiKey,
});

registerExtractionRoutes({
  app,
  aiExtractLimiter,
  getOpenRouterApiKey,
  OPENROUTER_MODEL,
});

registerTestSupportRoutes({
  app,
  database,
  saveDB,
  isProduction,
  seedSampleData: process.env.SEED_SAMPLE_DATA,
});

registerPdfGenerationRoutes({
  app,
  backendDir: __dirname,
});

registerAutocropperRoutes({
  app,
  AUTOCROPPER_URL,
});

const distPath = path.join(__dirname, '../app/dist');
const viteDevProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:5000';

if (isProduction) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    const fallbackKind = getSpaFallbackResponseKind(req.path);
    if (fallbackKind === 'spa') {
      res.sendFile(path.join(distPath, 'index.html'));
      return;
    }
    if (fallbackKind === 'api-404') {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.status(404).type('text/plain').send('Not found');
  });
} else {
  app.use('/', createViteDevProxyMiddleware({ targetUrl: viteDevProxyTarget }));
}

app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = isProduction
    ? 'Internal server error'
    : err.message || 'Internal server error';
  console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${err.message}`);
  if (!res.headersSent) {
    res.status(status).json({ success: false, error: message });
  }
});

const servers = [];
const primaryServer = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (isProduction) {
    console.log('✅ Production mode: serving frontend from dist/');
  } else {
    console.log(`🔧 Development mode: proxying to Vite at ${viteDevProxyTarget}`);
  }

  const availableTestProjects = DEFAULT_TEST_CODES
    .map((code) => database.projects[code])
    .filter(Boolean);
  if (!isProduction && availableTestProjects.length > 0) {
    console.log('Test codes: ELT20250001 (solar) | ELT20250002 (aerothermal) | ELT20250003 (solar) | ELT20250004 (solar-ec) | ELT20250005 (ec-flow)');
    console.log('Test phones: +34612345678 | +34623456789 | +34655443322 | +34666000004 | +34666000005');
    availableTestProjects.forEach((project) => {
      console.log(`🔗 ${project.code}: ${buildCustomerProjectUrl(project.code)}`);
    });
  }
});
servers.push(primaryServer);

if (!isProduction) {
  attachViteDevProxyUpgrade(primaryServer, { targetUrl: viteDevProxyTarget });
}

if (isProduction && PORT !== LEGACY_COMPAT_PORT) {
  const compatServer = app.listen(LEGACY_COMPAT_PORT, () => {
    console.log(`✅ Legacy compatibility listener active on http://localhost:${LEGACY_COMPAT_PORT}`);
  });
  compatServer.on('error', (error) => {
    console.warn(`⚠️  Failed to bind legacy compatibility port ${LEGACY_COMPAT_PORT}: ${error.message}`);
  });
  servers.push(compatServer);
}

registerGracefulShutdown({ servers });
