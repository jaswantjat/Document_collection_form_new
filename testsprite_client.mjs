import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';

const API_KEY = process.env.TESTSPRITE_API_KEY;
const PROJECT_PATH = process.cwd(); // /home/runner/workspace
const PROJECT_NAME = 'workspace';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@testsprite/testsprite-mcp@latest'],
  env: { ...process.env, API_KEY },
});

const client = new Client({ name: 'eltex-runner', version: '1.0.0' });

async function callTool(name, args) {
  console.log(`\n📡 [${name}]`);
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
  const str = JSON.stringify(val, null, 2);
  console.log(`${label}:\n${str.slice(0, 1500)}`);
  if (str.length > 1500) console.log('... [truncated]');
}

async function main() {
  await client.connect(transport);
  console.log('✅ Connected to TestSprite MCP\n');

  // STEP 1 — Bootstrap (first-time setup)
  const configExists = fs.existsSync(`${PROJECT_PATH}/.testsprite/config.json`);
  console.log(`Config exists: ${configExists}`);

  if (!configExists) {
    const boot = await callTool('testsprite_bootstrap', {
      localPort: 5000,
      type: 'frontend',
      projectPath: PROJECT_PATH,
      testScope: 'codebase',
      pathname: '/?code=ELT20250001',
    });
    printResult('Bootstrap', boot);
  }

  // STEP 2 — code_summary already written to testsprite_tests/tmp/code_summary.yaml
  // Call generate_code_summary to follow the official flow
  const summary = await callTool('testsprite_generate_code_summary', {
    projectRootPath: PROJECT_PATH,
  });
  printResult('Code summary', summary);

  // STEP 3 — Generate PRD
  const prd = await callTool('testsprite_generate_standardized_prd', {
    projectPath: PROJECT_PATH,
  });
  printResult('PRD', prd);

  // STEP 4 — Generate frontend test plan
  const plan = await callTool('testsprite_generate_frontend_test_plan', {
    projectPath: PROJECT_PATH,
    needLogin: false,
  });
  printResult('Frontend test plan', plan);

  // STEP 5 — Generate and execute
  const exec = await callTool('testsprite_generate_code_and_execute', {
    projectName: PROJECT_NAME,
    projectPath: PROJECT_PATH,
    testIds: [],
    additionalInstruction: 'App uses ?code=ELT20250001 for customer auth. Admin dashboard at /dashboard uses password eltex2025.',
    serverMode: 'development',
  });
  printResult('Execute', exec);

  await client.close();
  console.log('\n✅ Done. Check testsprite_tests/ for results.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
