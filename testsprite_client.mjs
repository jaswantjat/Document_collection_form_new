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
      'App uses ?code=ELT20250001 through ?code=ELT20250005 for customer auth.',
      'Admin dashboard at /dashboard uses password eltex2025.',
      'Backend API runs on port 3001, frontend on port 5000.',
      'DNI back photo is required when uploading front of a DNI card (not required for NIE).',
      'Province determines which legal PDFs must be signed: Cataluña=3 docs, Madrid/Valencia=2 docs, other=none.',
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
