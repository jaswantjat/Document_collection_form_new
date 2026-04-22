const AdmZip = require('adm-zip');

function registerPdfConversionRoutes({
  app,
  pdfLimiter,
  pdfUpload,
  STIRLING_PDF_URL,
  getStirlingApiKey,
  logger,
}) {
  const routeLogger = logger.child({ module: 'pdfConversionRoutes' });
  app.post('/api/pdf-to-images', pdfLimiter, pdfUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No se recibió ningún archivo PDF.',
        });
      }

      const apiKey = getStirlingApiKey();
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          message: 'Stirling-PDF no configurado (falta STIRLING_PDF_API_KEY). Usando conversión local.',
        });
      }

      const boundary = `----FormBoundary${Date.now()}`;
      const parts = [];
      const addField = (name, value) => {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
      };

      addField('imageFormat', 'png');
      addField('singleImage', 'false');
      addField('dpi', '200');

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
          'X-API-KEY': apiKey,
        },
        body: bodyParts,
      });

      if (!stirlingRes.ok) {
        const errorText = await stirlingRes.text().catch(() => '');
        routeLogger.error('pdf_conversion.upstream_failed', {
          route: '/api/pdf-to-images',
          filename: req.file.originalname,
          statusCode: stirlingRes.status,
          failureReason: errorText.slice(0, 200),
        });
        return res.status(502).json({
          success: false,
          message: `El servicio de conversión de PDF devolvió un error (${stirlingRes.status}).`,
        });
      }

      let zip;
      try {
        zip = new AdmZip(Buffer.from(await stirlingRes.arrayBuffer()));
      } catch (error) {
        routeLogger.error('pdf_conversion.invalid_zip', {
          route: '/api/pdf-to-images',
          filename: req.file.originalname,
          failureReason: error.message,
        }, error);
        return res.status(502).json({
          success: false,
          message: 'La respuesta del servicio de conversión no era válida.',
        });
      }

      const entries = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory && /\.(png|jpg|jpeg)$/i.test(entry.entryName))
        .sort((left, right) => left.entryName.localeCompare(right.entryName, undefined, { numeric: true }));

      if (entries.length === 0) {
        return res.status(502).json({
          success: false,
          message: 'El PDF no generó ninguna imagen. Comprueba que el archivo sea válido.',
        });
      }

      const images = entries.map((entry) => {
        const ext = entry.entryName.match(/\.(png|jpg|jpeg)$/i)?.[1]?.toLowerCase() || 'png';
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        return {
          name: entry.entryName.replace(/^.*[\\/]/, ''),
          data: entry.getData().toString('base64'),
          mimeType,
        };
      });

      routeLogger.info('pdf_conversion.completed', {
        route: '/api/pdf-to-images',
        filename: req.file.originalname,
        imageCount: images.length,
      });
      return res.json({ success: true, images });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const likelyConnectivityIssue = /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(message);
      routeLogger.error('pdf_conversion.failed', {
        route: '/api/pdf-to-images',
        filename: req.file?.originalname || null,
        failureReason: message || 'unexpected error',
        retryable: likelyConnectivityIssue,
      }, err);
      if (likelyConnectivityIssue) {
        return res.status(502).json({
          success: false,
          message: 'No se pudo conectar con el servicio de conversión de PDF. Inténtalo de nuevo en unos minutos.',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Error inesperado al convertir el PDF.',
      });
    }
  });
}

module.exports = {
  registerPdfConversionRoutes,
};
