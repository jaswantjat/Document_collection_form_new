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
  console.log('\n🔍 Generating code summary...');
  const summary = await callTool('testsprite_generate_code_summary', {
    projectRootPath: PROJECT_PATH,
  });
  printResult('Code Summary', summary);

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
      'ROUTING: This is a pure SPA. All customer routes use /?code=ELTXXXXXX — never path-based URLs like /property-docs or /review. Always navigate to http://localhost:5000/?code=ELT20250001.',
      'AUTH: Customer routes use ?code=ELT20250001 through ?code=ELT20250005. Admin dashboard at http://localhost:5000/dashboard uses password eltex2025 (no username field).',
      'PORTS: Backend API on port 3001, frontend on port 5000.',
      'DNI RULES: Back photo required when front is a DNI card (not required for NIE certificates or NIE cards).',
      'PROVINCE SIGNING: Cataluña=3 docs (autorització, generalitat, IVA Catalunya), Madrid/Valencia=2 docs (IVA España, poder representació), other=no signing.',
      'TEST PROJECTS: ELT20250001=solar (empty), ELT20250002=aerothermal, ELT20250003=solar, ELT20250004=solar-ec (has location=other, goes directly to energy certificate), ELT20250005=ec-flow (has location=other, goes directly to energy certificate).',
      'SIGNATURE CANVAS: The signature pad canvas has data-testid="signature-canvas" and data-has-signature="true|false". CRITICAL: To sign, execute this exact JavaScript in the browser: `await page.evaluate(() => window.__eltexFillTestSignature())`. Do NOT try to simulate mouse strokes, clicks, or drag events on the canvas — they will NOT register a signature. After calling __eltexFillTestSignature(), wait for data-has-signature="true" on the canvas element, then click the confirm button.',
      'CONTRACT CARD: Has data-testid="contract-card" and data-contract-status="empty|accepted". Use data-contract-status="accepted" to verify a PDF upload was successful.',
      'DASHBOARD DETAIL FLOW (TC008): To open a project detail and verify extracted data: (1) authenticate with password eltex2025, (2) click the button with data-testid="ver-expediente-btn" on the target project row — NOT the "Ver archivo" eye button, (3) wait for the modal with data-testid="project-detail-modal" to appear, (4) verify content inside the modal such as the project code, customer name, or document labels like "DNI / NIE", "Nombre", "Domicilio". The "Ver archivo" (eye) button opens files in a NEW TAB — do not use it to verify extracted data.',
      'DASHBOARD FILE BUTTONS: File view button has data-testid="view-asset-btn", download has data-testid="download-asset-btn". aria-busy="true" while loading. Wait for aria-busy to become false before interacting. These buttons open assets in new browser tabs.',
      'AUTO-SAVE TEST (TC012): To test auto-save and restore: (1) navigate to /?code=ELT20250001, (2) use page.setInputFiles() to upload a file to the file input (locate with css selector input[type="file"]). (3) wait 5 seconds for auto-save to run (look for save indicator), (4) navigate to / and enter phone 612345678 to resume, (5) verify the document preview thumbnail image is visible — do NOT look for a filename in a file input (file inputs cannot be pre-populated for security reasons). The preview thumbnail img element will be visible if the save was successful.',
      'SECTION ROUTING: Use ELT20250004 or ELT20250005 to reach the energy certificate section directly (they have location pre-set to other and representation already complete).',
      'NO DEFERRED SIGNATURE: There is no "Firmar más tarde" button — signatures cannot be deferred. To test the review screen, use a project that already has all signatures complete.',
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
