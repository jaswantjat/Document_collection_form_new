const fetch = require('node-fetch');

async function test() {
  const response = await fetch('http://localhost:3001/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: 'mock',
      documentType: 'dniAuto'
    })
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
