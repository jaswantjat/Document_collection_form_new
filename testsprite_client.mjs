import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';

const API_KEY = process.env.TESTSPRITE_API_KEY;
const PROJECT_PATH = process.cwd(); // /home/runner/workspace
const PROJECT_NAME = 'eltex-document-collection';

if (!API_KEY) {
  console.error('❌ TESTSPRITE_API_KEY is not set');
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@testsprite/testsprite-mcp@latest'],
  env: { ...process.env, API_KEY },
});

const client = new Client({ name: 'eltex-runner', version: '1.0.0' });

async function callTool(name, args) {
  console.log(`\n📡 Calling: ${name}`);
  try {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content?.[0];
    if (content?.type === 'text') {
      try { return JSON.parse(content.text); } catch { return content.text; }
    }
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

function printResult(label, val) {
  const str = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
  const preview = str.slice(0, 2000);
  console.log(`\n── ${label} ──\n${preview}`);
  if (str.length > 2000) console.log(`... [${str.length - 2000} more chars truncated]`);
}

async function main() {
  await client.connect(transport);
  console.log('✅ Connected to TestSprite MCP\n');

  // ── STEP 1: Bootstrap ──────────────────────────────────────────────────────
  const configExists = fs.existsSync(`${PROJECT_PATH}/testsprite_tests/tmp/config.json`);
  console.log(`Config exists: ${configExists}`);

  if (!configExists) {
    console.log('\n🔧 Running bootstrap...');
    const boot = await callTool('testsprite_bootstrap', {
      localPort: 5000,
      type: 'frontend',
      projectPath: PROJECT_PATH,
      testScope: 'codebase',
      pathname: '/?code=ELT20250001',
    });
    printResult('Bootstrap', boot);
    if (boot?.error) {
      console.error('❌ Bootstrap failed:', boot.error);
      process.exit(1);
    }
  } else {
    console.log('✅ Config already exists, skipping bootstrap.');
  }

  // ── STEP 2: Generate Code Summary ─────────────────────────────────────────
  // If we already have a custom code_summary.yaml (version: "2"), preserve it.
  const codeSummaryPath = `${PROJECT_PATH}/testsprite_tests/tmp/code_summary.yaml`;
  const existingCodeSummary = fs.existsSync(codeSummaryPath) &&
    fs.readFileSync(codeSummaryPath, 'utf8').includes('test_project_states');
  if (existingCodeSummary) {
    console.log('\n✅ Custom code_summary.yaml already exists — skipping regeneration.');
  } else {
    console.log('\n🔍 Generating code summary...');
    const summary = await callTool('testsprite_generate_code_summary', {
      projectRootPath: PROJECT_PATH,
    });
    printResult('Code Summary', summary);
  }

  // ── STEP 3: Generate Standardized PRD ────────────────────────────────────
  console.log('\n📋 Generating standardized PRD...');
  const prd = await callTool('testsprite_generate_standardized_prd', {
    projectPath: PROJECT_PATH,
  });
  printResult('Standardized PRD', prd);
  if (prd?.error) {
    console.error('⚠️  PRD generation issue:', prd.error);
  }

  // ── STEP 4: Generate Frontend Test Plan ───────────────────────────────────
  console.log('\n🗺️  Generating frontend test plan...');
  const plan = await callTool('testsprite_generate_frontend_test_plan', {
    projectPath: PROJECT_PATH,
    needLogin: false,
  });
  printResult('Frontend Test Plan', plan);

  // ── STEP 5: Generate Code and Execute ─────────────────────────────────────
  console.log('\n🚀 Generating tests and executing...');
  console.log('   (This may take several minutes — real browser tests are running)\n');
  const exec = await callTool('testsprite_generate_code_and_execute', {
    projectName: PROJECT_NAME,
    projectPath: PROJECT_PATH,
    testIds: [],
    additionalInstruction: [
      'ROUTING: This is a pure SPA. All customer routes use /?code=ELTXXXXXX — never path-based URLs. Always navigate via http://localhost:5000/?code=ELT2025XXXX.',
      'AUTH: Admin dashboard at http://localhost:5000/dashboard uses password eltex2025 (password field only, no username field).',
      'PORTS: Backend API on port 3001, frontend on port 5000.',

      // Project starting sections — critical for correct test routing
      'PROJECT STARTING SECTIONS (use these to target the right step):',
      '  ELT20250001: starts at REPRESENTATION step (has docs + location=cataluna but no signatures yet). Phone: +34612345678. Use for representation signing tests.',
      '  ELT20250002: starts at PROVINCE-SELECTION step (has docs, no location set). Phone: +34623456789. Use for province selection tests.',
      '  ELT20250003: starts at PROPERTY-DOCS step (no docs, no location). Phone: +34655443322. Use for document upload tests.',
      '  ELT20250004: starts at ENERGY-CERTIFICATE step (location=other, has docs). Phone: +34666000004. Use for energy certificate tests.',
      '  ELT20250005: starts at REVIEW step (location=other, has docs, energy=skipped). Phone: +34666000005. Use for review/submit tests.',

      // Province selection
      'PROVINCE SIGNING: Cataluña=3 docs signed, Madrid/Valencia=2 docs signed, other=no signing.',
      'PROVINCE TESTIDS: province-btn-cataluna, province-btn-madrid, province-btn-valencia, select-province-btn, province-continue-btn, province-back-btn.',

      // Signature canvas — CRITICAL
      'SIGNATURE CANVAS: Only exists in the REPRESENTATION section (not in energy certificate). data-testid="signature-canvas" with data-has-signature="true|false".',
      'CRITICAL SIGNATURE INJECTION: await page.evaluate(() => window.__eltexFillTestSignature()). Do NOT simulate mouse events on the canvas. After calling, wait for data-has-signature="true", then click representation-continue-btn.',
      'REPRESENTATION BUTTONS: representation-continue-btn (disabled until signed, data-signed=true/false), representation-defer-btn (Firmar más tarde — defers signing and continues), representation-back-btn.',

      // Energy certificate — NO signature canvas
      'ENERGY CERTIFICATE: 4-step survey with energy-cert-next-btn (step 1-3), energy-cert-back-btn, energy-cert-confirm-btn (final step), skip-energy-certificate-btn. NO signature canvas in this section.',
      'SKIP ENERGY CERT: skip-energy-certificate-btn is only visible when on the energy-certificate section. For skip tests use ELT20250004 (starts there). ELT20250005 is already at review — skip button NOT visible.',

      // Dashboard
      'DASHBOARD DETAIL: (1) login with eltex2025, (2) click data-testid="ver-expediente-btn" to open project modal, (3) verify modal data-testid="project-detail-modal".',
      'DASHBOARD BUTTONS: download-zip-btn=Descargar ZIP (in project-detail-modal header, downloads full project ZIP), export-csv-btn=Exportar CSV (in toolbar), logout-btn=cerrar sesion, view-asset-btn=view file in new tab, download-asset-btn=download single file.',

      // DNI rules
      'DNI RULES: DNI card front → back photo REQUIRED. NIE card or NIE certificate → back NOT required.',

      // Deferred signing
      'DEFERRED SIGNING: representation-defer-btn (Firmar más tarde) allows deferring signing. After deferring, the signing item shows incomplete in review.',

      // Submission / Success
      'SUBMISSION SUCCESS: After clicking review-submit-btn and successful API call, a success screen renders with data-testid="success-section". Wait for this element to verify submission succeeded.',
      'REVIEW SUBMIT: review-submit-btn is only visible (and clickable) when ALL checklist items are complete. Use ELT20250005 to reach review with all items done.',
    ].join(' '),
    serverMode: 'development',
  });
  printResult('Execute Result', exec);

  await client.close();
  console.log('\n✅ Done! Check testsprite_tests/ for generated test files and results.');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
