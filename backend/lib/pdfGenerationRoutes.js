const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');

const REPRESENTACIO_PAGE_SIZE = { width: 1241, height: 1754 };
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

function getCurrentDateCatalan() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

function registerPdfGenerationRoutes({ app, backendDir }) {
  app.post('/api/generate-representacio-pdf', async (req, res) => {
    try {
      const { persona_interessada, representant_legal, lloc, isCompany, signature } = req.body;
      const templatePath = path.join(backendDir, '../app/dist/autoritzacio-representacio.jpg');
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          success: false,
          error: 'TEMPLATE_NOT_FOUND',
          message: 'Plantilla PDF no encontrada',
        });
      }

      const imageBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.create();
      const jpgImage = await pdfDoc.embedJpg(imageBytes);
      const { width, height } = jpgImage.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(jpgImage, { x: 0, y: 0, width, height });

      const textColor = rgb(0.1, 0.1, 0.6);
      const textSize = 20;

      if (persona_interessada) {
        drawScaledText(page, persona_interessada.nom, REPRESENTACIO_FIELDS.personaNom, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, persona_interessada.nif, REPRESENTACIO_FIELDS.personaNif, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, persona_interessada.adreca, REPRESENTACIO_FIELDS.personaAdreca, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, persona_interessada.codi_postal, REPRESENTACIO_FIELDS.personaCodiPostal, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, persona_interessada.municipi, REPRESENTACIO_FIELDS.personaMunicipi, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      }
      if (isCompany && representant_legal) {
        drawScaledText(page, representant_legal.nom, REPRESENTACIO_FIELDS.empresaNom, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, representant_legal.nif, REPRESENTACIO_FIELDS.empresaNif, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, representant_legal.adreca, REPRESENTACIO_FIELDS.empresaAdreca, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, representant_legal.codi_postal, REPRESENTACIO_FIELDS.empresaCodiPostal, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, representant_legal.municipi, REPRESENTACIO_FIELDS.empresaMunicipi, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      }

      drawScaledText(page, lloc, REPRESENTACIO_FIELDS.lloc, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, getCurrentDateCatalan(), REPRESENTACIO_FIELDS.data, REPRESENTACIO_PAGE_SIZE, width, height, textSize, textColor);
      await drawScaledSignature(page, pdfDoc, signature, REPRESENTACIO_FIELDS.signaturaPersonaInteressada, REPRESENTACIO_PAGE_SIZE, width, height);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="autoritzacio-representacio.pdf"');
      res.send(Buffer.from(await pdfDoc.save()));
    } catch (err) {
      console.error('PDF generation error:', err);
      res.status(500).json({
        success: false,
        error: 'PDF_GENERATION_ERROR',
        message: 'Error al generar PDF',
      });
    }
  });

  app.post('/api/generate-poder-pdf', async (req, res) => {
    try {
      const { persona_interessada, representant_legal, lloc, isCompany, signature } = req.body;
      const templatePath = path.join(backendDir, '../app/dist/poder-representacio.png');
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          success: false,
          error: 'TEMPLATE_NOT_FOUND',
          message: 'Plantilla PDF no encontrada',
        });
      }

      const imageBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.create();
      const pngImage = await pdfDoc.embedPng(imageBytes);
      const { width, height } = pngImage.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(pngImage, { x: 0, y: 0, width, height });

      const textColor = rgb(0.1, 0.1, 0.6);
      const textSize = 20;

      if (persona_interessada) {
        drawScaledText(page, persona_interessada.nom, PODER_ES_FIELDS.persona_interesada_nombre_razon_social, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, persona_interessada.nif, PODER_ES_FIELDS.persona_interesada_nif, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, persona_interessada.adreca, PODER_ES_FIELDS.persona_interesada_direccion, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, persona_interessada.codi_postal, PODER_ES_FIELDS.persona_interesada_codigo_postal, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, persona_interessada.municipi, PODER_ES_FIELDS.persona_interesada_municipio, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      }
      if (isCompany && representant_legal) {
        drawScaledText(page, representant_legal.nom, PODER_ES_FIELDS.persona_juridica_representante_legal_nombre_razon_social, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, representant_legal.nif, PODER_ES_FIELDS.persona_juridica_representante_legal_nif, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, representant_legal.adreca, PODER_ES_FIELDS.persona_juridica_representante_legal_direccion, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, representant_legal.codi_postal, PODER_ES_FIELDS.persona_juridica_representante_legal_codigo_postal, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
        drawScaledText(page, representant_legal.municipi, PODER_ES_FIELDS.persona_juridica_representante_legal_municipio, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      }

      drawScaledText(page, lloc, PODER_ES_FIELDS.lugar, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      drawScaledText(page, getCurrentDateCatalan(), PODER_ES_FIELDS.fecha, PODER_ES_PAGE_SIZE, width, height, textSize, textColor);
      await drawScaledSignature(page, pdfDoc, signature, PODER_ES_FIELDS.firma_persona_interesada, PODER_ES_PAGE_SIZE, width, height);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="poder-representacio.pdf"');
      res.send(Buffer.from(await pdfDoc.save()));
    } catch (err) {
      console.error('PDF generation error:', err);
      res.status(500).json({
        success: false,
        error: 'PDF_GENERATION_ERROR',
        message: 'Error al generar PDF',
      });
    }
  });

  app.post('/api/generate-image-pdf', async (req, res) => {
    try {
      const { imageDataUrl, filename } = req.body || {};
      if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_IMAGE',
          message: 'Se requiere una imagen en formato data URL.',
        });
      }

      const imageBytes = dataUrlToBuffer(imageDataUrl);
      if (!imageBytes) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_IMAGE',
          message: 'No se pudo procesar la imagen.',
        });
      }

      const pdfDoc = await PDFDocument.create();
      const image = imageDataUrl.startsWith('data:image/png')
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);
      const { width, height } = image.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });

      const safeFilename =
        typeof filename === 'string' && filename.trim()
          ? filename.trim()
          : 'documento-firmado.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.send(Buffer.from(await pdfDoc.save()));
    } catch (err) {
      console.error('Overlay PDF generation error:', err);
      res.status(500).json({
        success: false,
        error: 'PDF_GENERATION_ERROR',
        message: 'Error al generar el PDF desde la imagen.',
      });
    }
  });
}

module.exports = {
  registerPdfGenerationRoutes,
  renderedImageToPdfBuffer,
};
