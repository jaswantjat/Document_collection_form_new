function registerAutocropperRoutes({ app, AUTOCROPPER_URL }) {
  app.post('/api/autocropper/process', async (req, res) => {
    try {
      const { documentType, images } = req.body || {};
      if (!documentType) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'documentType is required',
        });
      }
      if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'images array is required',
        });
      }

      const response = await fetch(`${AUTOCROPPER_URL}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType, images }),
      });

      if (!response.ok) {
        console.error('Autocropper service error:', response.status, response.statusText);
        return res.status(response.status).json({
          success: false,
          error: 'AUTOCROPPER_SERVICE_ERROR',
          message: 'Error communicating with autocropper service',
        });
      }

      res.json(await response.json());
    } catch (err) {
      console.error('Autocropper proxy error:', err);
      res.status(500).json({
        success: false,
        error: 'AUTOCROPPER_ERROR',
        message: 'Error procesando documento',
      });
    }
  });

  app.get('/api/autocropper/health', async (_req, res) => {
    try {
      const response = await fetch(`${AUTOCROPPER_URL}/health`);
      if (response.ok) {
        const health = await response.json();
        return res.json({ ...health, proxy: 'connected' });
      }

      return res.status(503).json({
        status: 'unavailable',
        service: 'autocropper',
        proxy: 'disconnected',
      });
    } catch (_err) {
      return res.status(503).json({
        status: 'error',
        service: 'autocropper',
        proxy: 'error',
      });
    }
  });
}

module.exports = {
  registerAutocropperRoutes,
};
