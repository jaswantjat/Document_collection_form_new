import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testPdfGeneration() {
  console.log('Generating test PDF...');
  
  try {
    // 1. Load the background image
    const imagePath = path.join(__dirname, '../app/public/autoritzacio-representacio.jpg');
    const imageBytes = await fs.readFile(imagePath);

    const pdfDoc = await PDFDocument.create();
    const pngImage = await pdfDoc.embedPng(imageBytes);
    const { width, height } = pngImage.scale(1); 
    
    console.log(`Image dimensions: ${width}x${height}`);

    const page = pdfDoc.addPage([width, height]);
    
    page.drawImage(pngImage, { x: 0, y: 0, width, height });

    // All coordinates are A4 points scaled to 1358x1920 px image.
    // scaleX = 1358/595 = 2.282, scaleY = 1920/842 = 2.280
    // pdf-lib Y origin is BOTTOM-LEFT so: y_px = (842 - y_pt - h_pt) / 842 * 1920
    
    const textSize = 20;
    const textColor = rgb(0.1, 0.1, 0.6);

    // Nom i cognoms: A4 x=180, y=135, h=15 → x=411, y_bottom=(842-150)/842*1920=1577
    page.drawText('CUETO EIZAGUIRRE ANA MARIA IGNACIA', { x: 411, y: 1577, size: textSize, color: textColor });
    // NIF: A4 x=405, y=135, h=15 → x=924, y_bottom=1577
    page.drawText('50802939X', { x: 924, y: 1577, size: textSize, color: textColor });

    // Adreça: A4 x=180, y=153, h=15 → y_bottom=(842-168)/842*1920=1536
    page.drawText('C. ANTONIO MACHADO 69', { x: 411, y: 1536, size: textSize, color: textColor });
    // CP: A4 x=405, y=153 → x=924, y_bottom=1536
    page.drawText('28600', { x: 924, y: 1536, size: textSize, color: textColor });

    // Municipi: A4 x=180, y=172, h=15 → y_bottom=(842-187)/842*1920=1492
    page.drawText('NAVALCARNERO', { x: 411, y: 1492, size: textSize, color: textColor });

    // Lloc: A4 x=60, y=695, h=15 → x=137, y_bottom=(842-710)/842*1920=300
    page.drawText('Madrid', { x: 137, y: 300, size: textSize, color: textColor });
    // Data: A4 x=345, y=695 → x=787, y_bottom=300
    page.drawText('24/03/2026', { x: 787, y: 300, size: textSize, color: textColor });

    // 4. Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    const outputPath = path.join(__dirname, 'test-poder.pdf');
    await fs.writeFile(outputPath, pdfBytes);
    console.log('Successfully created test PDF at:', outputPath);

  } catch (error) {
    console.error('Error generating PDF:', error);
  }
}

testPdfGeneration();
