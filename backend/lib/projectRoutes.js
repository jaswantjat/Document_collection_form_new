const { v4: uuidv4 } = require('uuid');
const { buildFormNotificationPayload } = require('./formNotificationSummary');
const {
  recordFormNotification,
  shouldSkipDuplicateFormNotification,
} = require('./formNotificationDedupe');

function checkCataloniaPDFs(formData) {
  if (!formData) {
    return { canGenerateRepresentacio: false, canGeneratePoder: false };
  }

  const isCataluna = formData.representation?.location === 'cataluna';
  if (!isCataluna) {
    return { canGenerateRepresentacio: false, canGeneratePoder: false };
  }

  return {
    canGenerateRepresentacio: Boolean(formData.representation?.representacioSignature),
    canGeneratePoder: Boolean(formData.representation?.poderRepresentacioSignature),
  };
}

function extractCompletedDocKeys(formData, assetFiles, existingFormData = null) {
  const keys = [];
  const af = assetFiles || {};

  const hasDniFront =
    formData?.dni?.front?.photo
    || Boolean(af.dniFront)
    || Boolean(formData?.dni?.front?.extraction)
    || existingFormData?.dni?.front?.photo;
  const hasDniBack =
    formData?.dni?.back?.photo
    || Boolean(af.dniBack)
    || Boolean(formData?.dni?.back?.extraction)
    || existingFormData?.dni?.back?.photo;

  if (hasDniFront) keys.push('dni_front');
  if (hasDniBack) keys.push('dni_back');

  const hasIbi =
    formData?.ibi?.photo
    || (Array.isArray(formData?.ibi?.pages) && formData.ibi.pages.length > 0)
    || Object.keys(af).some((key) => key.startsWith('ibi_'));
  if (hasIbi) {
    keys.push('ibi');
  }

  const hasElectricity =
    (Array.isArray(formData?.electricityBill?.pages) && formData.electricityBill.pages.length > 0)
    || Object.keys(af).some((key) => key.startsWith('electricity_'));
  if (hasElectricity) {
    keys.push('electricity_bill');
  }

  if (formData?.energyCertificate?.status === 'completed') {
    keys.push('energy_certificate');
  }

  const location = formData?.representation?.location ?? formData?.location;
  if (location === 'cataluna') {
    if (formData?.representation?.renderedDocuments?.catalunaIva) keys.push('cataluna_iva');
    if (formData?.representation?.renderedDocuments?.catalunaGeneralitat) keys.push('cataluna_generalitat');
    if (formData?.representation?.renderedDocuments?.catalunaRepresentacio) keys.push('cataluna_representacio');
  } else if (location) {
    if (formData?.representation?.renderedDocuments?.spainIva) keys.push('spain_iva');
    if (formData?.representation?.renderedDocuments?.spainPoder) keys.push('spain_poder');
  }

  return keys;
}

function computeRequiredDocs() {
  return ['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate'];
}

function localeFromPhone(phone) {
  if (!phone) return null;
  const e164 = String(phone).replace(/[\s\-().]/g, '');
  if (e164.startsWith('+34') || e164.startsWith('0034')) return 'es';
  if (e164.startsWith('+351') || e164.startsWith('00351')) return 'pt';
  if (e164.startsWith('+33') || e164.startsWith('0033')) return 'fr';
  if (e164.startsWith('+44') || e164.startsWith('0044')) return 'en';
  if (e164.startsWith('+49') || e164.startsWith('0049')) return 'de';
  if (e164.startsWith('+39') || e164.startsWith('0039')) return 'it';
  if (e164.startsWith('+32') || e164.startsWith('0032')) return 'fr';
  if (e164.startsWith('+31') || e164.startsWith('0031')) return 'nl';
  return null;
}

function hasFormNotificationsWebhookConfigured() {
  return Boolean(process.env.ELTEX_FORM_NOTIFICATIONS_WEBHOOK_URL);
}

function getFormNotificationLocale(project, formData) {
  return localeFromPhone(project.phone) || project.customerLanguage || formData?.browserLanguage || 'es';
}

function createFormNotificationSender({
  FORM_NOTIFICATIONS_WEBHOOK_SECRET,
  getProjectSnapshot,
  saveDB,
}) {
  return async function fireFormNotification(
    project,
    {
      eventType,
      docsUploaded = [],
      source = 'customer',
      submittedAt = null,
    } = {}
  ) {
    const webhookUrl = process.env.ELTEX_FORM_NOTIFICATIONS_WEBHOOK_URL;
    if (!webhookUrl) return true;

    const payload = buildFormNotificationPayload({
      eventType,
      project,
      formData: project.formData || {},
      snapshot: getProjectSnapshot(project.formData || {}),
      docsUploaded,
      docsRequired: computeRequiredDocs(project.productType),
      locale: getFormNotificationLocale(project, project.formData),
      source,
      submittedAt,
      publicFormBaseUrl: process.env.ELTEX_PUBLIC_FORM_BASE_URL,
    });

    console.log(
      `[FormNotifications] ${eventType} payload for ${project.code}: `
      + `source=${payload.source} | uploaded=${payload.documents.uploaded_keys.join(', ') || 'none'} `
      + `| pending=${payload.documents.pending_labels.join(' | ')}`
    );

    if (shouldSkipDuplicateFormNotification(project, payload)) {
      console.log(
        `[FormNotifications] ${eventType} skipped for ${project.code}: duplicate payload inside dedupe window`
      );
      return true;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Eltex-Webhook-Secret': FORM_NOTIFICATIONS_WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        console.error(
          `[FormNotifications] ${eventType} failed for ${project.code}: HTTP ${response.status}${responseText ? ` ${responseText.slice(0, 200)}` : ''}`
        );
        return false;
      }

      recordFormNotification(project, payload);
      saveDB();
      console.log(`[FormNotifications] ${eventType} sent for ${project.code} → HTTP ${response.status}`);
      return true;
    } catch (err) {
      console.error(`[FormNotifications] ${eventType} failed for ${project.code}:`, err.message);
      return false;
    }
  };
}

function createDocFlowSenders({ LEGACY_DOCFLOW_WEBHOOK_SECRET, getProjectSnapshot }) {
  async function fireDocFlowNewOrder(project, docsUploaded = []) {
    const webhookUrl = process.env.ELTEX_DOCFLOW_WEBHOOK_URL;
    if (!webhookUrl) return true;

    const snapshot = getProjectSnapshot(project.formData);
    const payload = {
      type: 'new_order',
      order_id: project.code,
      customer_name:
        snapshot.fullName
        || (project.customerName !== 'Cliente nuevo' ? project.customerName : null)
        || 'cliente',
      first_name: snapshot.firstName || null,
      last_name: snapshot.lastName || null,
      phone: project.phone || '',
      locale: localeFromPhone(project.phone) || 'es',
      product_type: project.productType || null,
      contract_date: (project.createdAt || new Date().toISOString()).slice(0, 10),
      assessor: project.assessor || null,
      docs_required: computeRequiredDocs(project.productType),
      docs_uploaded: docsUploaded,
    };

    console.log(
      `[DocFlow] new_order payload for ${project.code}: customer_name=${JSON.stringify(payload.customer_name)} `
      + `| first_name=${JSON.stringify(payload.first_name)} | last_name=${JSON.stringify(payload.last_name)} `
      + `| locale=${JSON.stringify(payload.locale)} | product_type=${JSON.stringify(payload.product_type)} `
      + `| phone=${payload.phone} | contract_date=${payload.contract_date} `
      + `| assessor=${JSON.stringify(payload.assessor)} | docs_uploaded=${docsUploaded.join(', ') || 'none'}`
    );

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Eltex-Webhook-Secret': LEGACY_DOCFLOW_WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      console.log(`[DocFlow] new_order sent for ${project.code} → HTTP ${response.status}`);
      return true;
    } catch (err) {
      console.error(`[DocFlow] new_order failed for ${project.code}:`, err.message);
      return false;
    }
  }

  function fireDocFlowDocUpdate(orderCode, docsUploaded) {
    const webhookUrl = process.env.ELTEX_DOCFLOW_WEBHOOK_URL;
    if (!webhookUrl) return;

    console.log(`[DocFlow] doc_update payload for ${orderCode}: docs_uploaded=${docsUploaded.join(', ') || 'none'}`);
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Eltex-Webhook-Secret': LEGACY_DOCFLOW_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ type: 'doc_update', order_id: orderCode, docs_uploaded: docsUploaded }),
    })
      .then((response) => console.log(`[DocFlow] doc_update sent for ${orderCode} → HTTP ${response.status}`))
      .catch((err) => console.error(`[DocFlow] doc_update failed for ${orderCode}:`, err.message));
  }

  return { fireDocFlowNewOrder, fireDocFlowDocUpdate };
}

function resolveCustomerName(formData) {
  const dniName = formData?.dni?.front?.extraction?.extractedData?.fullName;
  const contractName = formData?.contract?.extraction?.extractedData?.fullName;
  const ibiTitular = formData?.ibi?.extraction?.extractedData?.titular ?? null;
  const electricityTitular = formData?.electricityBill?.pages?.[0]?.extraction?.extractedData?.titular ?? null;
  return contractName || dniName || ibiTitular || electricityTitular;
}

function registerProjectRoutes({
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
}) {
  const fireFormNotification = createFormNotificationSender({
    FORM_NOTIFICATIONS_WEBHOOK_SECRET,
    getProjectSnapshot,
    saveDB,
  });
  const { fireDocFlowNewOrder, fireDocFlowDocUpdate } = createDocFlowSenders({
    LEGACY_DOCFLOW_WEBHOOK_SECRET,
    getProjectSnapshot,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'Backend is running', timestamp: new Date().toISOString() });
  });

  app.get('/api/project/:code', requireProject, (req, res) => {
    res.json({ success: true, project: serializeProject(req.project) });
  });

  app.get('/api/lookup/phone/:phone', (req, res) => {
    const needle = normalizePhone(decodeURIComponent(req.params.phone));
    const project = Object.values(database.projects).find((entry) => normalizePhone(entry.phone) === needle);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'No encontramos ningún proyecto con ese teléfono. Contacta con tu asesor.',
      });
    }

    res.json({
      success: true,
      project: serializeProject(project, { includeAccessToken: true }),
    });
  });

  app.post('/api/project/create', (req, res) => {
    const { phone, customerName, email, productType, assessor, assessorId } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'El número de teléfono es obligatorio.' });
    }
    if (!assessor || !assessor.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre del asesor es obligatorio.' });
    }
    if (!isApprovedAssessor(assessor.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Selecciona un asesor de la lista aprobada.',
      });
    }

    const normalizedPhone = normalizePhone(phone);
    const existing = Object.values(database.projects).find(
      (project) => normalizePhone(project.phone) === normalizedPhone
    );
    if (existing) {
      return res.json({
        success: true,
        project: serializeProject(existing, { includeAccessToken: true }),
        existing: true,
      });
    }

    const code = generateProjectCode();
    const project = {
      code,
      accessToken: uuidv4(),
      customerName: customerName || 'Cliente nuevo',
      phone: normalizedPhone,
      email: email || '',
      productType: productType || 'solar',
      assessor: assessor.trim(),
      assessorId: assessorId ? String(assessorId).trim() : assessor.trim(),
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: new Date().toISOString(),
    };

    database.projects[code] = project;
    saveDB();
    res.json({
      success: true,
      project: serializeProject(project, { includeAccessToken: true }),
      existing: false,
    });
  });

  app.post('/api/dashboard/project/:code/secure-link', requireDashboardAuth, (req, res) => {
    const project = database.projects[req.params.code];
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'PROJECT_NOT_FOUND',
        message: 'Proyecto no encontrado.',
      });
    }

    res.json({
      success: true,
      project: serializeProject(project, { includeAccessToken: true }),
      customerUrl: buildCustomerProjectUrl(project.code, project.accessToken),
    });
  });

  app.post('/api/project/:code/save', requireProject, (req, res) => {
    const project = req.project;
    const { formData, source } = req.body;

    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({ success: false, message: 'formData inválido.' });
    }

    project.formData = formData;
    project.lastActivity = new Date().toISOString();

    const resolvedName = resolveCustomerName(formData);
    if (resolvedName) {
      project.customerName = resolvedName;
    }
    if (formData?.browserLanguage && source !== 'assessor') {
      project.customerLanguage = formData.browserLanguage;
    }

    project.cataloniaPDFs = checkCataloniaPDFs(formData);
    saveDB();
    res.json({
      success: true,
      message: 'Progreso guardado.',
      cataloniaPDFs: project.cataloniaPDFs,
    });
  });

  app.post('/api/project/:code/submit', requireProject, async (req, res) => {
    const project = req.project;
    const { formData, source, attemptId } = req.body;

    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({ success: false, message: 'formData inválido.' });
    }
    if (typeof attemptId !== 'string' || !attemptId.trim()) {
      return res.status(400).json({ success: false, message: 'attemptId obligatorio.' });
    }

    const normalizedAttemptId = attemptId.trim();
    const attemptState = beginSubmissionAttempt(project, normalizedAttemptId, source || 'customer');

    if (attemptState.status === 'completed') {
      const existingSubmissionId = attemptState.submission?.id || attemptState.submissionId;
      return res.json({
        success: true,
        message: 'Documentación enviada correctamente.',
        submissionId: existingSubmissionId,
        cataloniaPDFs: project.cataloniaPDFs || checkCataloniaPDFs(project.formData || formData),
      });
    }
    if (attemptState.status === 'processing') {
      return res.status(409).json({
        success: false,
        message: 'El envío ya está en curso. Inténtalo de nuevo en unos segundos.',
      });
    }

    try {
      const submission = {
        id: uuidv4(),
        attemptId: normalizedAttemptId,
        timestamp: new Date().toISOString(),
        source: source || 'customer',
        ipAddress: req.ip,
        formData,
      };

      const existingFormData = project.formData || null;
      project.submissions.push(submission);
      project.formData = formData;
      project.lastActivity = new Date().toISOString();

      const resolvedName = resolveCustomerName(formData);
      if (resolvedName) {
        project.customerName = resolvedName;
      }
      if (formData?.browserLanguage && source !== 'assessor') {
        project.customerLanguage = formData.browserLanguage;
      }

      const pdfStatus = checkCataloniaPDFs(formData);
      project.cataloniaPDFs = pdfStatus;
      completeSubmissionAttempt(project, normalizedAttemptId, submission);
      saveDB();

      const testDelayMs = getTestSubmitDelayMs(req);
      if (testDelayMs > 0) {
        await sleep(testDelayMs);
      }

      res.json({
        success: true,
        message: 'Documentación enviada correctamente.',
        submissionId: submission.id,
        cataloniaPDFs: pdfStatus,
      });

      const docsUploaded = extractCompletedDocKeys(formData, project.assetFiles, existingFormData);
      const notificationLabel = hasFormNotificationsWebhookConfigured() ? 'FormNotifications' : 'DocFlow';
      console.log(`[${notificationLabel}] ${project.code} docs detected: ${docsUploaded.join(', ') || 'none'}`);

      if (!project.docflowNewOrderSent) {
        project.docflowNewOrderSent = true;
        saveDB();
        const ok = hasFormNotificationsWebhookConfigured()
          ? await fireFormNotification(project, {
              eventType: 'form_submitted',
              docsUploaded,
              source: submission.source,
              submittedAt: submission.timestamp,
            })
          : await fireDocFlowNewOrder(project, docsUploaded);

        if (!ok) {
          project.docflowNewOrderSent = false;
          saveDB();
        }
      } else if (hasFormNotificationsWebhookConfigured()) {
        void fireFormNotification(project, {
          eventType: 'form_updated',
          docsUploaded,
          source: submission.source,
          submittedAt: submission.timestamp,
        });
      } else {
        fireDocFlowDocUpdate(project.code, docsUploaded);
      }
    } catch (error) {
      failSubmissionAttempt(project, normalizedAttemptId);
      throw error;
    }
  });

  app.post(
    '/api/project/:code/upload-assets',
    requireProject,
    (req, res, next) => {
      assetUpload.fields(ASSET_FIELDS)(req, res, (err) => {
        if (err) {
          console.error('[upload-assets] multer error:', err);
          return res.status(400).json({
            success: false,
            message: err.message || 'Error al subir archivos.',
          });
        }
        next();
      });
    },
    (req, res) => {
      const project = req.project;
      const files = req.files || {};
      const activeAssetKeys = normalizeActiveAssetKeys(req.body?.activeKeys);
      const { assetFiles, removedPaths } = pruneManagedAssetFiles(project.assetFiles, activeAssetKeys);
      const projectAssetsPath = `/uploads/assets/${project.code}`;
      const replacedPaths = [];

      for (const [fieldName, fileArray] of Object.entries(files)) {
        if (Array.isArray(fileArray) && fileArray.length > 0) {
          const nextPath = `${projectAssetsPath}/${fileArray[0].filename}`;
          const previousPath = assetFiles[fieldName];
          if (typeof previousPath === 'string' && previousPath && previousPath !== nextPath) {
            replacedPaths.push(previousPath);
          }
          assetFiles[fieldName] = nextPath;
        }
      }

      project.assetFiles = assetFiles;
      project.lastActivity = new Date().toISOString();
      saveDB();
      deleteAssetFiles(DATA_DIR, [...removedPaths, ...replacedPaths]);

      res.json({ success: true, savedKeys: Object.keys(assetFiles) });
    }
  );

  app.post('/api/upload', requireDashboardAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió archivo.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  });
}

module.exports = {
  registerProjectRoutes,
};
