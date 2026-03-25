import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Coordinates as percentages of image dimensions (1358x1920)
const COORDS = {
  // Dades de la persona interessada (Top Box)
  nom_interessat: { x: 0.32, y: 0.14 },
  nif_interessat: { x: 0.73, y: 0.14 },
  adreca_interessat: { x: 0.16, y: 0.17 },
  cp_interessat: { x: 0.78, y: 0.17 },
  municipi_interessat: { x: 0.17, y: 0.195 },

  // Dades del representant legal (Second Box)
  nom_representant: { x: 0.32, y: 0.26 },
  nif_representant: { x: 0.73, y: 0.26 },
  adreca_representant: { x: 0.16, y: 0.28 },
  cp_representant: { x: 0.78, y: 0.28 },
  municipi_representant: { x: 0.17, y: 0.305 },

  // Footer
  lloc: { x: 0.12, y: 0.84 },
  data: { x: 0.58, y: 0.84 },
};

const IMAGE_WIDTH = 1358;
const IMAGE_HEIGHT = 1920;

function getPixelCoords(coordPct) {
  return {
    x: Math.round(coordPct.x * IMAGE_WIDTH),
    y: Math.round(IMAGE_HEIGHT - (coordPct.y * IMAGE_HEIGHT)) // Flip Y for PDF (bottom-left origin)
  };
}

export async function stampPoder(formData) {
  const imagePath = path.join(__dirname, '../app/public/autoritzacio-representacio.jpg');
  const imageBytes = await fs.readFile(imagePath);

  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(imageBytes);

  const page = pdfDoc.addPage([IMAGE_WIDTH, IMAGE_HEIGHT]);
  page.drawImage(pngImage, { x: 0, y: 0, width: IMAGE_WIDTH, height: IMAGE_HEIGHT });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const textSize = 16;
  const textColor = rgb(0.1, 0.1, 0.3);

  // Helper to draw text
  const drawField = (key, value, options = {}) => {
    if (!value) return;
    const coords = getPixelCoords(COORDS[key]);
    const { x, y } = coords;
    page.drawText(String(value), {
      x,
      y: y - (options.yOffset || 0),
      size: options.size || textSize,
      font: options.bold ? fontBold : font,
      color: textColor,
    });
  };

  // Persona interessada
  drawField('nom_interessat', formData.persona_interessada?.nom);
  drawField('nif_interessat', formData.persona_interessada?.nif);
  drawField('adreca_interessat', formData.persona_interessada?.adreca, { size: 13 });
  drawField('cp_interessat', formData.persona_interessada?.codi_postal);
  drawField('municipi_interessat', formData.persona_interessada?.municipi);

  // Representant legal
  drawField('nom_representant', formData.representant_legal?.nom);
  drawField('nif_representant', formData.representant_legal?.nif);
  drawField('adreca_representant', formData.representant_legal?.adreca, { size: 13 });
  drawField('cp_representant', formData.representant_legal?.codi_postal);
  drawField('municipi_representant', formData.representant_legal?.municipi);

  // Footer
  drawField('lloc', formData.lloc, { bold: true });
  drawField('data', formData.data || new Date().toLocaleDateString('ca-ES'), { bold: true });

  return await pdfDoc.save();
}

// CLI test
if (import.meta.url === `file://${process.argv[1]}`) {
  const testData = {
    persona_interessada: {
      nom: 'Joan Garcia Lopez',
      nif: '12345678X',
      adreca: 'Carrer Major, 123',
      codi_postal: '08001',
      municipi: 'Barcelona'
    },
    representant_legal: {
      nom: 'Maria Martinez Puig',
      nif: '87654321Y',
      adreca: 'Avinguda Diagonal, 456',
      codi_postal: '08002',
      municipi: 'Barcelona'
    },
    lloc: 'Barcelona',
    data: '24/03/2026'
  };

  const pdfBytes = await stampPoder(testData);
  const outputPath = path.join(__dirname, 'output-poder.pdf');
  await fs.writeFile(outputPath, pdfBytes);
  console.log('Generated:', outputPath);
}
