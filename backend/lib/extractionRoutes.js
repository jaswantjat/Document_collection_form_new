const {
  isAdditionalBankDocumentType,
  normalizeAdditionalBankDocumentExtraction,
} = require('./additionalBankDocumentExtraction');
const {
  getExtractionPrompt,
  getWrongDocumentMessage,
  PROMPTS,
} = require('./extractionPrompts');
const {
  isValidIdentityNumber,
  normalizeExtractedStringFields,
  normalizeIdentityExtraction,
} = require('./extractionNormalization');
const { requestUpstream } = require('./upstreamHttp');

function parseJsonObject(content) {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (error) {
    return null;
  }
}

function buildOpenRouterImageContent(images) {
  return images.map((image) => ({
    type: 'image_url',
    image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` },
  }));
}

async function callOpenRouter({ openRouterApiKey, model, messages, maxTokens }) {
  const response = await requestUpstream('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.1,
    }),
    timeoutMs: 45000,
  });

  return response;
}

function normalizeIbiExtraction(extraction) {
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
    return {
      success: false,
      isWrongDocument: true,
      reason: 'wrong-document',
      message: 'Documento incorrecto o incompleto. Por favor sube el recibo del IBI con todos los datos visibles.',
    };
  }

  if (data.direccion) {
    const match = String(data.direccion).match(/\bSIT(?:UACION)?[:\s-]*([^()]+)/i);
    if (match?.[1]) {
      data.direccion = match[1].trim();
    }
  }

  return null;
}

function normalizeElectricityExtraction(extraction) {
  if (!extraction.extractedData?.cups) return;
  const cups = String(extraction.extractedData.cups).replace(/\s+/g, '').toUpperCase();
  extraction.extractedData.cups = cups;
  if (!cups.startsWith('ES') || cups.length < 20 || cups.length > 22) {
    extraction.extractedData.cupsWarning = 'El CUPS no tiene el formato esperado.';
  }
}

async function handleOpenRouterError(response) {
  const errorText = await response.text().catch(() => '');
  let userMessage = 'No se pudo analizar automáticamente.';
  if (response.status === 401) userMessage = 'API key de OpenRouter inválida o no configurada.';
  else if (response.status === 402) userMessage = 'Créditos de OpenRouter agotados.';
  else if (response.status === 429) userMessage = 'Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.';

  return { errorText, userMessage };
}

function registerExtractionRoutes({
  app,
  aiExtractLimiter,
  getOpenRouterApiKey,
  OPENROUTER_MODEL,
}) {
  app.post('/api/extract', aiExtractLimiter, async (req, res) => {
    const { imageBase64, imagesBase64, documentType } = req.body;
    const imagesToSend =
      imagesBase64 && Array.isArray(imagesBase64) && imagesBase64.length > 0
        ? imagesBase64
        : imageBase64
          ? [imageBase64]
          : null;

    if (!imagesToSend || !documentType) {
      return res.status(400).json({
        success: false,
        message: 'Faltan imageBase64 o documentType.',
      });
    }

    const prompt = getExtractionPrompt(documentType);
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: `Tipo de documento no soportado: ${documentType}`,
      });
    }

    const openRouterApiKey = getOpenRouterApiKey();
    if (!openRouterApiKey) {
      return res.status(503).json({
        success: false,
        isUnreadable: false,
        needsManualReview: true,
        reason: 'temporary-error',
        message: 'Servicio de extracción no configurado. Contacta al administrador.',
      });
    }

    try {
      const response = await callOpenRouter({
        openRouterApiKey,
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                imagesToSend.length > 1
                  ? `${prompt}\n\nNota: el documento tiene ${imagesToSend.length} páginas, todas adjuntas. Analiza el conjunto para extraer los datos.`
                  : prompt,
            },
            ...buildOpenRouterImageContent(imagesToSend),
          ],
        }],
        maxTokens: 800,
      });

      if (!response.ok) {
        const { errorText, userMessage } = await handleOpenRouterError(response);
        console.error('OpenRouter error:', response.status, errorText);
        return res.json({
          success: false,
          isUnreadable: false,
          needsManualReview: true,
          reason: 'temporary-error',
          message: userMessage,
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log(`[extract:${documentType}] AI response:`, content.slice(0, 300));

      let extraction = parseJsonObject(content);
      if (!extraction) {
        return res.json({
          success: false,
          isUnreadable: true,
          reason: 'unreadable',
          message: 'No se pudo analizar la imagen. Asegúrate de que el documento esté bien iluminado y enfocado.',
        });
      }

      if (extraction.isReadable === false) {
        return res.json({
          success: false,
          isUnreadable: true,
          reason: 'unreadable',
          message: 'La imagen no es lo suficientemente clara. Por favor, vuelve a hacer la foto asegurándote de: buena iluminación, sin reflejos ni sombras, documento completo y texto perfectamente enfocado.',
        });
      }

      if (!extraction.isCorrectDocument) {
        return res.json({
          success: false,
          isWrongDocument: true,
          reason: 'wrong-document',
          message: getWrongDocumentMessage(documentType),
        });
      }

      if (documentType === 'dniAuto') {
        extraction = normalizeIdentityExtraction(extraction);
      } else if (extraction.extractedData && typeof extraction.extractedData === 'object') {
        extraction.extractedData = normalizeExtractedStringFields(extraction.extractedData);
      }

      if (isAdditionalBankDocumentType(documentType)) {
        const normalized = normalizeAdditionalBankDocumentExtraction(documentType, extraction);
        extraction = normalized.extraction;
        if (normalized.wrongDocumentMessage) {
          return res.json({
            success: false,
            isWrongDocument: true,
            reason: 'wrong-document',
            message: normalized.wrongDocumentMessage,
          });
        }
      }

      if (documentType === 'electricity') {
        normalizeElectricityExtraction(extraction);
      }

      if (documentType === 'ibi') {
        const ibiError = normalizeIbiExtraction(extraction);
        if (ibiError) {
          return res.json(ibiError);
        }
      }

      return res.json({
        success: true,
        side: documentType === 'dniAuto' ? extraction.side || null : undefined,
        extraction: {
          ...extraction,
          needsManualReview: extraction.confidence < 0.75,
        },
        needsManualReview: extraction.confidence < 0.75,
        message: 'Datos extraídos correctamente.',
      });
    } catch (err) {
      console.error('AI extraction error:', err);
      return res.json({
        success: false,
        extraction: null,
        needsManualReview: true,
        reason: 'temporary-error',
        message: 'Error en el análisis. Inténtalo de nuevo en unos segundos.',
      });
    }
  });

  app.post('/api/extract-batch', aiExtractLimiter, async (req, res) => {
    const { imagesBase64, documentType } = req.body;
    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0 || !documentType) {
      return res.status(400).json({
        success: false,
        message: 'Faltan imagesBase64 o documentType.',
      });
    }

    const prompt = getExtractionPrompt(documentType);
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: `Tipo de documento no soportado: ${documentType}`,
      });
    }

    const openRouterApiKey = getOpenRouterApiKey();
    if (!openRouterApiKey) {
      return res.status(503).json({
        success: false,
        needsManualReview: true,
        reason: 'temporary-error',
        message: 'Servicio de extracción no configurado. Contacta al administrador.',
      });
    }

    const imageCount = imagesBase64.length;
    const batchNote =
      imageCount > 1
        ? `\n\nIMPORTANT: You are receiving ${imageCount} images — they are ALL pages of the SAME document. Extract and MERGE all data found across ALL pages into a single JSON response. Fields found on any page must be included in the merged result.`
        : '';

    try {
      const response = await callOpenRouter({
        openRouterApiKey,
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt + batchNote },
            ...buildOpenRouterImageContent(imagesBase64),
          ],
        }],
        maxTokens: 1000,
      });

      if (!response.ok) {
        const { errorText, userMessage } = await handleOpenRouterError(response);
        console.error('[extract-batch] OpenRouter error:', response.status, errorText.slice(0, 200));
        return res.json({
          success: false,
          needsManualReview: true,
          reason: 'temporary-error',
          message: userMessage,
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log(`[extract-batch:${documentType}] AI response (${imageCount} img):`, content.slice(0, 300));

      let extraction = parseJsonObject(content);
      if (!extraction) {
        return res.json({
          success: false,
          isUnreadable: true,
          reason: 'unreadable',
          message: 'No se pudo analizar las imágenes. Asegúrate de que los documentos estén bien iluminados y enfocados.',
        });
      }
      if (extraction.isReadable === false) {
        return res.json({
          success: false,
          isUnreadable: true,
          reason: 'unreadable',
          message: 'Las imágenes no son lo suficientemente claras. Asegúrate de buena iluminación, sin reflejos, y texto perfectamente enfocado.',
        });
      }
      if (!extraction.isCorrectDocument) {
        return res.json({
          success: false,
          isWrongDocument: true,
          reason: 'wrong-document',
          message: getWrongDocumentMessage(documentType),
        });
      }

      if (extraction.extractedData && typeof extraction.extractedData === 'object') {
        extraction.extractedData = normalizeExtractedStringFields(extraction.extractedData);
      }
      if (documentType === 'electricity') {
        normalizeElectricityExtraction(extraction);
      }
      if (documentType === 'ibi') {
        const ibiError = normalizeIbiExtraction(extraction);
        if (ibiError) {
          return res.json(ibiError);
        }
      }
      if (isAdditionalBankDocumentType(documentType)) {
        const normalized = normalizeAdditionalBankDocumentExtraction(documentType, extraction);
        if (normalized.wrongDocumentMessage) {
          return res.json({
            success: false,
            isWrongDocument: true,
            reason: 'wrong-document',
            message: normalized.wrongDocumentMessage,
          });
        }
        extraction = normalized.extraction;
      }

      return res.json({
        success: true,
        extraction: {
          ...extraction,
          needsManualReview: extraction.confidence < 0.75,
        },
        needsManualReview: extraction.confidence < 0.75,
      });
    } catch (err) {
      console.error('[extract-batch] Unexpected error:', err);
      return res.json({
        success: false,
        needsManualReview: true,
        reason: 'temporary-error',
        message: 'Error interno. Inténtalo de nuevo en unos segundos.',
      });
    }
  });

  app.post('/api/extract-dni-batch', aiExtractLimiter, async (req, res) => {
    const { imagesBase64 } = req.body;
    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
      return res.status(400).json({ success: false, message: 'Faltan imagesBase64.' });
    }

    const openRouterApiKey = getOpenRouterApiKey();
    if (!openRouterApiKey) {
      return res.status(503).json({
        success: false,
        message: 'Servicio de extracción no configurado. Contacta al administrador.',
      });
    }

    const imageCount = imagesBase64.length;
    try {
      const response = await callOpenRouter({
        openRouterApiKey,
        model: OPENROUTER_MODEL,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${PROMPTS.dniAutoBatch}\n\nAttached images: ${imageCount}. Return exactly ${imageCount} result objects.`,
            },
            ...buildOpenRouterImageContent(imagesBase64),
          ],
        }],
        maxTokens: 1400,
      });

      if (!response.ok) {
        const { errorText, userMessage } = await handleOpenRouterError(response);
        console.error('[extract-dni-batch] OpenRouter error:', response.status, errorText.slice(0, 200));
        return res.json({ success: false, message: userMessage });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log(`[extract-dni-batch] AI response (${imageCount} img):`, content.slice(0, 300));

      const parsed = parseJsonObject(content);
      if (!parsed || !Array.isArray(parsed.results) || parsed.results.length !== imageCount) {
        return res.json({
          success: false,
          message: 'No se pudo analizar el DNI correctamente.',
        });
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
            message: 'La imagen no es lo suficientemente clara. Por favor, vuelve a hacer la foto con buena iluminación y texto enfocado.',
          };
        }
        if (!normalizedItem.isCorrectDocument) {
          return {
            side: normalizedItem.side || null,
            isWrongDocument: true,
            reason: 'wrong-document',
            message: 'Documento incorrecto. Por favor sube el DNI/NIE.',
          };
        }

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

      return res.json({ success: true, results });
    } catch (err) {
      console.error('[extract-dni-batch] Unexpected error:', err);
      return res.json({
        success: false,
        message: 'Error interno. Inténtalo de nuevo en unos segundos.',
      });
    }
  });
}

module.exports = {
  registerExtractionRoutes,
};
