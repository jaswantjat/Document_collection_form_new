const { randomUUID: uuidv4 } = require('crypto');
const { buildFormNotificationPayload } = require('./formNotificationSummary');
const {
  recordFormNotification,
  shouldSkipDuplicateFormNotification,
} = require('./formNotificationDedupe');
const { extractCompletedDocKeys } = require('./formNotificationProjectState');
const { recordDeliveryAttempt } = require('./deliveryStatus');

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
  logger,
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
    if (!webhookUrl) {
      recordDeliveryAttempt(project, 'formNotifications', {
        configured: false,
        eventType,
        outcome: 'disabled',
        message: 'ELTEX_FORM_NOTIFICATIONS_WEBHOOK_URL not configured.',
      });
      saveDB();
      return true;
    }

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

    logger.info('form_notification.payload', {
      route: '/api/project/:code/submit',
      projectCode: project.code,
      eventType,
      source: payload.source,
      uploadedKeys: payload.documents.uploaded_keys,
      pendingLabels: payload.documents.pending_labels,
    });

    if (shouldSkipDuplicateFormNotification(project, payload)) {
      recordDeliveryAttempt(project, 'formNotifications', {
        configured: true,
        eventType,
        outcome: 'skipped',
        message: 'Duplicate payload inside dedupe window.',
      });
      saveDB();
      logger.info('form_notification.skipped', {
        route: '/api/project/:code/submit',
        projectCode: project.code,
        eventType,
        reason: 'duplicate payload inside dedupe window',
      });
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
        recordDeliveryAttempt(project, 'formNotifications', {
          configured: true,
          eventType,
          outcome: 'failed',
          statusCode: response.status,
          message: responseText ? responseText.slice(0, 200) : `HTTP ${response.status}`,
        });
        saveDB();
        logger.error('form_notification.failed', {
          route: '/api/project/:code/submit',
          projectCode: project.code,
          eventType,
          statusCode: response.status,
          failureReason: responseText ? responseText.slice(0, 200) : 'non-ok response',
        });
        return false;
      }

      recordFormNotification(project, payload);
      recordDeliveryAttempt(project, 'formNotifications', {
        configured: true,
        eventType,
        outcome: 'delivered',
        statusCode: response.status,
        message: 'Notification delivered.',
      });
      saveDB();
      logger.info('form_notification.delivered', {
        route: '/api/project/:code/submit',
        projectCode: project.code,
        eventType,
        statusCode: response.status,
      });
      return true;
    } catch (err) {
      recordDeliveryAttempt(project, 'formNotifications', {
        configured: true,
        eventType,
        outcome: 'failed',
        message: err.message,
      });
      saveDB();
      logger.error('form_notification.failed', {
        route: '/api/project/:code/submit',
        projectCode: project.code,
        eventType,
        failureReason: err.message,
      }, err);
      return false;
    }
  };
}

function createDocFlowSenders({
  LEGACY_DOCFLOW_WEBHOOK_SECRET,
  getProjectSnapshot,
  saveDB,
  logger,
}) {
  async function fireDocFlowNewOrder(project, docsUploaded = []) {
    const webhookUrl = process.env.ELTEX_DOCFLOW_WEBHOOK_URL;
    if (!webhookUrl) {
      recordDeliveryAttempt(project, 'docflowNewOrder', {
        configured: false,
        eventType: 'new_order',
        outcome: 'disabled',
        message: 'ELTEX_DOCFLOW_WEBHOOK_URL not configured.',
      });
      saveDB();
      return true;
    }

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

    logger.info('docflow.new_order.payload', {
      route: '/api/project/:code/submit',
      projectCode: project.code,
      eventType: 'new_order',
      docsUploaded,
      assessor: payload.assessor,
      locale: payload.locale,
      productType: payload.product_type,
    });

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
      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        recordDeliveryAttempt(project, 'docflowNewOrder', {
          configured: true,
          eventType: 'new_order',
          outcome: 'failed',
          statusCode: response.status,
          message: responseText ? responseText.slice(0, 200) : `HTTP ${response.status}`,
        });
        saveDB();
        logger.error('docflow.new_order.failed', {
          route: '/api/project/:code/submit',
          projectCode: project.code,
          statusCode: response.status,
          failureReason: responseText ? responseText.slice(0, 200) : 'non-ok response',
        });
        return false;
      }

      recordDeliveryAttempt(project, 'docflowNewOrder', {
        configured: true,
        eventType: 'new_order',
        outcome: 'delivered',
        statusCode: response.status,
        message: 'Webhook delivered.',
      });
      saveDB();
      logger.info('docflow.new_order.delivered', {
        route: '/api/project/:code/submit',
        projectCode: project.code,
        statusCode: response.status,
      });
      return true;
    } catch (err) {
      recordDeliveryAttempt(project, 'docflowNewOrder', {
        configured: true,
        eventType: 'new_order',
        outcome: 'failed',
        message: err.message,
      });
      saveDB();
      logger.error('docflow.new_order.failed', {
        route: '/api/project/:code/submit',
        projectCode: project.code,
        failureReason: err.message,
      }, err);
      return false;
    }
  }

  async function fireDocFlowDocUpdate(project, docsUploaded) {
    const webhookUrl = process.env.ELTEX_DOCFLOW_WEBHOOK_URL;
    if (!webhookUrl) {
      recordDeliveryAttempt(project, 'docflowDocUpdate', {
        configured: false,
        eventType: 'doc_update',
        outcome: 'disabled',
        message: 'ELTEX_DOCFLOW_WEBHOOK_URL not configured.',
      });
      saveDB();
      return true;
    }

    logger.info('docflow.doc_update.payload', {
      route: '/api/project/:code/submit',
      projectCode: project.code,
      eventType: 'doc_update',
      docsUploaded,
    });

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Eltex-Webhook-Secret': LEGACY_DOCFLOW_WEBHOOK_SECRET,
        },
        body: JSON.stringify({ type: 'doc_update', order_id: project.code, docs_uploaded: docsUploaded }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        recordDeliveryAttempt(project, 'docflowDocUpdate', {
          configured: true,
          eventType: 'doc_update',
          outcome: 'failed',
          statusCode: response.status,
          message: responseText ? responseText.slice(0, 200) : `HTTP ${response.status}`,
        });
        saveDB();
        logger.error('docflow.doc_update.failed', {
          route: '/api/project/:code/submit',
          projectCode: project.code,
          statusCode: response.status,
          failureReason: responseText ? responseText.slice(0, 200) : 'non-ok response',
        });
        return false;
      }

      recordDeliveryAttempt(project, 'docflowDocUpdate', {
        configured: true,
        eventType: 'doc_update',
        outcome: 'delivered',
        statusCode: response.status,
        message: 'Webhook delivered.',
      });
      saveDB();
      logger.info('docflow.doc_update.delivered', {
        route: '/api/project/:code/submit',
        projectCode: project.code,
        statusCode: response.status,
      });
      return true;
    } catch (err) {
      recordDeliveryAttempt(project, 'docflowDocUpdate', {
        configured: true,
        eventType: 'doc_update',
        outcome: 'failed',
        message: err.message,
      });
      saveDB();
      logger.error('docflow.doc_update.failed', {
        route: '/api/project/:code/submit',
        projectCode: project.code,
        failureReason: err.message,
      }, err);
      return false;
    }
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
  getRuntimeHealth,
  logger,
}) {
  const routeLogger = logger.child({ module: 'projectRoutes' });
  const fireFormNotification = createFormNotificationSender({
    FORM_NOTIFICATIONS_WEBHOOK_SECRET,
    getProjectSnapshot,
    saveDB,
    logger: routeLogger.child({ integration: 'formNotifications' }),
  });
  const { fireDocFlowNewOrder, fireDocFlowDocUpdate } = createDocFlowSenders({
    LEGACY_DOCFLOW_WEBHOOK_SECRET,
    getProjectSnapshot,
    saveDB,
    logger: routeLogger.child({ integration: 'docflow' }),
  });

  app.get('/api/health', (_req, res) => {
    const health = getRuntimeHealth();
    res.status(health.ready ? 200 : 503).json({
      success: health.ready,
      ...health,
    });
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
      deliveryStatus: {},
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
      routeLogger.info('submission.docs_detected', {
        route: '/api/project/:code/submit',
        projectCode: project.code,
        notificationTarget: notificationLabel,
        docsUploaded,
      });

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
        void fireDocFlowDocUpdate(project, docsUploaded);
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
          routeLogger.warn('asset_upload.multer_error', {
            route: '/api/project/:code/upload-assets',
            projectCode: req.project?.code || req.params.code,
            failureReason: err.message || 'multer error',
          }, err);
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
