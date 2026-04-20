const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

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

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return source ?? target;
  if (!target || typeof target !== 'object') return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function registerDashboardRoutes({
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
}) {
  app.get('/api/dashboard', requireDashboardAuth, (_req, res) => {
    const projects = Object.values(database.projects)
      .map((project) => serializeDashboardProject(project))
      .sort((left, right) => {
        const leftDate = new Date(left.summary?.lastUpdated || 0).getTime();
        const rightDate = new Date(right.summary?.lastUpdated || 0).getTime();
        return rightDate - leftDate;
      });

    res.json({ success: true, projects });
  });

  app.post('/api/dashboard/project', requireDashboardAuth, (req, res) => {
    const input = normalizeDashboardCreateInput(req.body, normalizePhone);
    const validationError = validateDashboardCreateInput(input);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const existing = findProjectByNormalizedPhone(database.projects, input.normalizedPhone, normalizePhone);
    if (existing) {
      return res.json({
        success: true,
        existing: true,
        ...serializeDashboardProjectAction(existing, serializeProject),
      });
    }

    const project = createDashboardProjectRecord(
      input,
      generateProjectCode,
      uuidv4,
      new Date().toISOString()
    );

    database.projects[project.code] = project;
    saveDB();

    return res.json({
      success: true,
      existing: false,
      ...serializeDashboardProjectAction(project, serializeProject),
    });
  });

  app.get('/api/dashboard/project/:code', requireDashboardAuth, (req, res) => {
    const project = database.projects[req.params.code];
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'PROJECT_NOT_FOUND',
        message: 'Proyecto no encontrado.',
      });
    }

    res.json({ success: true, project: serializeProject(project, { includeAccessToken: true }) });
  });

  app.post('/api/dashboard/project/:code/resend', requireDashboardAuth, (req, res) => {
    const project = database.projects[req.params.code];
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'PROJECT_NOT_FOUND',
        message: 'Proyecto no encontrado.',
      });
    }

    return res.json({
      success: true,
      ...serializeDashboardProjectAction(project, serializeProject),
    });
  });

  app.delete('/api/dashboard/project/:code', requireDashboardAuth, async (req, res) => {
    const { code } = req.params;
    const project = database.projects[code];
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'PROJECT_NOT_FOUND',
        message: 'Proyecto no encontrado.',
      });
    }

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

  app.get('/api/dashboard/export/csv', requireDashboardAuth, (_req, res) => {
    const projects = Object.values(database.projects);
    const escape = (value) => {
      if (value == null) return '';
      const normalized = String(value).replace(/"/g, '""');
      return normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')
        ? `"${normalized}"`
        : normalized;
    };

    const headers = [
      'Código', 'Cliente', 'Teléfono', 'Email', 'Producto', 'Asesor',
      'Fecha creación', 'Última actividad', 'Envíos', 'Ubicación',
      'DNI Número', 'DNI Nombre', 'DNI Nacimiento', 'DNI Validez',
      'DNI Domicilio', 'DNI Municipio', 'DNI Provincia',
      'Ref. Catastral', 'Titular IBI', 'Dirección IBI',
      'CUPS', 'Potencia (kW)', 'Tipo fase', 'Dirección suministro',
      'Es empresa', 'Nombre empresa', 'NIF empresa', 'Dirección empresa', 'Municipio empresa', 'CP empresa',
      'Firma cliente', 'Firma comercial',
    ];

    const rows = projects.map((project) => {
      const fd = project.formData;
      const dniFront = fd?.dni?.front?.extraction?.extractedData || {};
      const dniBack = fd?.dni?.back?.extraction?.extractedData || {};
      const ibi = fd?.ibi?.extraction?.extractedData || {};
      const snapshot = getProjectSnapshot(fd);
      const signatures = fd?.signatures || {};
      const representation = fd?.representation || {};

      return [
        project.code,
        project.customerName,
        project.phone,
        project.email,
        project.productType,
        project.assessor,
        project.createdAt ? new Date(project.createdAt).toLocaleString('es-ES') : '',
        project.lastActivity ? new Date(project.lastActivity).toLocaleString('es-ES') : '',
        project.submissions.length,
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
        representation.isCompany ? 'Sí' : 'No',
        representation.companyName || '',
        representation.companyNIF || '',
        representation.companyAddress || '',
        representation.companyMunicipality || '',
        representation.companyPostalCode || '',
        signatures.customerSignature ? 'Sí' : 'No',
        signatures.repSignature ? 'Sí' : 'No',
      ].map(escape).join(',');
    });

    const csv = [headers.map(escape).join(','), ...rows].join('\r\n');
    const filename = `eltex_expedientes_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  });

  app.put('/api/project/:code/admin-formdata', requireDashboardAuth, (req, res) => {
    const { code } = req.params;
    const { formDataPatch } = req.body;
    const project = database.projects[code];

    if (!project) {
      return res.status(404).json({ success: false, message: 'Proyecto no encontrado.' });
    }
    if (!formDataPatch || typeof formDataPatch !== 'object') {
      return res.status(400).json({ success: false, message: 'formDataPatch requerido.' });
    }

    project.formData = deepMerge(project.formData || {}, formDataPatch);
    project.lastActivity = new Date().toISOString();

    const dniName = project.formData?.dni?.front?.extraction?.extractedData?.fullName;
    if (dniName) {
      project.customerName = dniName;
    }

    project.cataloniaPDFs = checkCataloniaPDFs(project.formData);
    saveDB();
    res.json({ success: true, formData: project.formData });
  });

  app.get('/api/project/:code/download-zip', requireDashboardAuth, async (req, res) => {
    try {
      const project = database.projects[req.params.code];
      if (!project) {
        return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });
      }

      const fd = project.formData;
      const zip = new AdmZip();

      const addBase64File = (label, dataUrl, folder) => {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        if (!mimeMatch) return;

        const mime = mimeMatch[1];
        const ext = mime === 'application/pdf'
          ? 'pdf'
          : mime === 'image/jpeg' || mime === 'image/jpg'
            ? 'jpg'
            : mime.split('/')[1]?.split('+')[0] || 'jpg';
        const buffer = Buffer.from(dataUrl.slice(mimeMatch[0].length), 'base64');
        const safeName = label.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        zip.addFile(`${folder}/${safeName}.${ext}`, buffer);
      };

      const assetFileToDataUrl = (assetPath) => {
        if (!assetPath) return null;
        const fullPath = path.join(DATA_DIR, assetPath.replace(/^\//, ''));
        if (!fs.existsSync(fullPath)) return null;
        const ext = path.extname(fullPath).slice(1).toLowerCase();
        const mime = ext === 'png' ? 'image/png' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
        return `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
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

      const addFileFromPath = (label, assetKey, folder) => {
        const assetPath = project.assetFiles?.[assetKey];
        if (!assetPath) return false;
        const fullPath = path.join(DATA_DIR, assetPath.replace(/^\//, ''));
        if (!fs.existsSync(fullPath)) return false;

        const rawExt = path.extname(fullPath).slice(1).toLowerCase();
        const ext = rawExt === 'jpeg' ? 'jpg' : rawExt || 'jpg';
        const safeName = label.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        zip.addFile(`${folder}/${safeName}.${ext}`, fs.readFileSync(fullPath));
        return true;
      };

      const addDocumentFile = (label, dataUrl, assetKey, folder) => {
        if (!addFileFromPath(label, assetKey, folder)) {
          addBase64File(label, dataUrl, folder);
        }
      };

      const addStoredFilesWithFallback = (label, files, assetKeyPrefix, folder) => {
        const assetFiles = project.assetFiles || {};
        const assetKeys = Object.keys(assetFiles)
          .filter((key) => key.startsWith(`${assetKeyPrefix}_`))
          .sort();

        if (assetKeys.length > 0) {
          assetKeys.forEach((key, index) => {
            addFileFromPath(assetKeys.length === 1 ? label : `${label}_${index + 1}`, key, folder);
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

        ibiPages.forEach((page, index) => {
          const label = ibiPages.length === 1 ? 'IBI' : `IBI_${index + 1}`;
          addDocumentFile(label, page?.preview, `ibi_${index}`, '1_documentos');
        });
        addStoredFilesWithFallback('IBI_original_pdf', fd.ibi?.originalPdfs, 'ibiOriginal', '1_documentos');

        getElectricityPages(fd).forEach((page, index) => {
          addDocumentFile(`Factura_luz_${index + 1}`, page?.photo?.preview, `electricity_${index}`, '1_documentos');
        });
        addStoredFilesWithFallback(
          'Factura_luz_original_pdf',
          fd.electricityBill?.originalPdfs,
          'electricityOriginal',
          '1_documentos'
        );

        const energyCertAssetDataUrl = assetFileToDataUrl(project.assetFiles?.energyCert);
        if (energyCertAssetDataUrl) {
          await addRenderedPdfFile('Certificado_energetico', energyCertAssetDataUrl, '2_certificados');
        } else if (fd.energyCertificate?.renderedDocument?.imageDataUrl) {
          await addRenderedPdfFile(
            'Certificado_energetico',
            fd.energyCertificate.renderedDocument.imageDataUrl,
            '2_certificados'
          );
        }
      }

      const zipBuffer = zip.toBuffer();
      const safeName = (project.customerName || project.code).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${project.code}_${safeName}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (error) {
      console.error(`[dashboard-zip-legacy] Failed for ${req.params.code}:`, error);
      res.status(500).json({ success: false, error: 'ZIP_EXPORT_FAILED' });
    }
  });

  app.get('/api/project/:code/download-manifest', requireDashboardAuth, (req, res) => {
    const project = database.projects[req.params.code];
    if (!project) {
      return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });
    }

    const fd = project.formData;
    const files = [];

    const addDataUrlFile = (label, dataUrl, category) => {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        files.push({
          label,
          category,
          dataUrl,
          mimeType: dataUrl.slice(5, dataUrl.indexOf(';')) || 'application/octet-stream',
        });
      }
    };

    const addStoredManifestFiles = (label, storedFiles, category) => {
      if (!Array.isArray(storedFiles)) return;
      storedFiles.forEach((file, index) => {
        addDataUrlFile(storedFiles.length === 1 ? label : `${label}_${index + 1}`, file?.dataUrl, category);
      });
    };

    const addManifestFileFromPath = (label, assetKey, category) => {
      const assetPath = project.assetFiles?.[assetKey];
      if (!assetPath) return false;
      const fullPath = path.join(DATA_DIR, assetPath.replace(/^\//, ''));
      if (!fs.existsSync(fullPath)) return false;

      const ext = path.extname(fullPath).slice(1) || 'jpg';
      const mime = ext === 'pdf' ? 'application/pdf' : `image/${ext}`;
      const buffer = fs.readFileSync(fullPath);
      files.push({
        label,
        category,
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        mimeType: mime,
      });
      return true;
    };

    const addManifestDocumentFile = (label, dataUrl, assetKey, category) => {
      if (!addManifestFileFromPath(label, assetKey, category)) {
        addDataUrlFile(label, dataUrl, category);
      }
    };

    const addStoredManifestFilesWithFallback = (label, storedFiles, assetKeyPrefix, category) => {
      const assetFiles = project.assetFiles || {};
      const assetKeys = Object.keys(assetFiles)
        .filter((key) => key.startsWith(`${assetKeyPrefix}_`))
        .sort();

      if (assetKeys.length > 0) {
        assetKeys.forEach((key, index) => {
          addManifestFileFromPath(assetKeys.length === 1 ? label : `${label}_${index + 1}`, key, category);
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
      addStoredManifestFilesWithFallback(
        'Factura_luz_original_pdf',
        fd.electricityBill?.originalPdfs,
        'electricityOriginal',
        'document-original-pdf'
      );
      addDataUrlFile('Firma_iva_cat', fd.representation?.ivaCertificateSignature, 'signed-form-signature');
      addDataUrlFile('Firma_generalitat', fd.representation?.generalitatSignature, 'signed-form-signature');
      addDataUrlFile('Firma_representacio_cat', fd.representation?.representacioSignature, 'signed-form-signature');
      addDataUrlFile('Firma_iva_es', fd.representation?.ivaCertificateEsSignature, 'signed-form-signature');
      addDataUrlFile('Firma_poder_es', fd.representation?.poderRepresentacioSignature, 'signed-form-signature');
      addManifestDocumentFile(
        'Certificado_energetico',
        fd.energyCertificate?.renderedDocument?.imageDataUrl,
        'energyCert',
        'generated-document'
      );
      addDataUrlFile('Firma_cliente', fd.signatures?.customerSignature, 'final-signature');
      addDataUrlFile('Firma_comercial', fd.signatures?.repSignature, 'final-signature');
    }

    res.json({
      success: true,
      projectCode: project.code,
      customerName: project.customerName,
      files,
    });
  });
}

module.exports = {
  registerDashboardRoutes,
};
