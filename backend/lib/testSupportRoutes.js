const {
  RESETTABLE_TEST_CODES,
  buildBaseFlowFormData,
  ensureResettableTestProject,
} = require('./testProjects');

function buildResetEnergyCertificate(partialHousing = {}) {
  return {
    status: 'not-started',
    housing: {
      cadastralReference: '',
      habitableAreaM2: '',
      floorCount: '',
      averageFloorHeight: null,
      bedroomCount: '',
      doorsByOrientation: { north: '', east: '', south: '', west: '' },
      windowsByOrientation: { north: '', east: '', south: '', west: '' },
      windowFrameMaterial: null,
      doorMaterial: '',
      windowGlassType: null,
      hasShutters: null,
      shutterWindowCount: '',
      ...partialHousing,
    },
    thermal: {
      thermalInstallationType: null,
      boilerFuelType: null,
      equipmentDetails: '',
      hasAirConditioning: null,
      airConditioningType: null,
      airConditioningDetails: '',
      heatingEmitterType: null,
      radiatorMaterial: null,
    },
    additional: {
      soldProduct: null,
      isExistingCustomer: null,
      hasSolarPanels: null,
      solarPanelDetails: '',
    },
    customerSignature: null,
    renderedDocument: null,
    completedAt: null,
    skippedAt: null,
  };
}

function resolveResettableProject(database, code, options) {
  const project = ensureResettableTestProject(database, code, options);
  if (project && !database.projects[code].formData) {
    database.projects[code].formData = buildBaseFlowFormData();
  }
  return project;
}

function validateResettableCode(code, isProduction, res) {
  if (isProduction) {
    res.status(403).json({ error: 'Not available in production' });
    return false;
  }
  if (!RESETTABLE_TEST_CODES.includes(code)) {
    res.status(403).json({ error: 'Only test projects can be reset' });
    return false;
  }
  return true;
}

function withResettableProject(database, saveDB, isProduction, options, handler) {
  return (req, res) => {
    const { code } = req.params;
    if (!validateResettableCode(code, isProduction, res)) return;

    const project = resolveResettableProject(database, code, options);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    handler(project);
    saveDB();
    res.json({ success: true });
  };
}

function registerTestSupportRoutes({ app, database, saveDB, isProduction, seedSampleData }) {
  const options = { isProduction, seedSampleData };

  app.post(
    '/api/test/reset-ec/:code',
    withResettableProject(database, saveDB, isProduction, options, (project) => {
      project.formData.energyCertificate = buildResetEnergyCertificate();
    })
  );

  app.post(
    '/api/test/reset-ec-partial/:code',
    withResettableProject(database, saveDB, isProduction, options, (project) => {
      project.formData.energyCertificate = buildResetEnergyCertificate({
        cadastralReference: '1234567VK1234A0001RT',
        habitableAreaM2: '85',
        floorCount: '2',
        bedroomCount: '3',
        doorsByOrientation: { north: '1', east: '0', south: '1', west: '0' },
        windowsByOrientation: { north: '2', east: '1', south: '3', west: '1' },
      });
    })
  );

  app.post(
    '/api/test/restore-base-flow/:code',
    withResettableProject(database, saveDB, isProduction, options, (project) => {
      project.formData = buildBaseFlowFormData();
    })
  );

  app.post(
    '/api/test/reset-property-docs/:code',
    withResettableProject(database, saveDB, isProduction, options, (project) => {
      project.formData.dni = {
        front: { photo: null, extraction: null },
        back: { photo: null, extraction: null },
        originalPdfs: [],
      };
      project.formData.ibi = {
        photo: null,
        pages: [],
        originalPdfs: [],
        extraction: null,
      };
      project.formData.electricityBill = { pages: [], originalPdfs: [] };
      project.formData.additionalBankDocuments = [];
      project.formData.location = undefined;
      project.formData.representation = {
        ...project.formData.representation,
        location: null,
      };
      project.formData.energyCertificate = buildResetEnergyCertificate();
      delete project.assetFiles;
    })
  );
}

module.exports = {
  registerTestSupportRoutes,
};
