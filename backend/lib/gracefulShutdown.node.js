const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');

const { closeServer, registerGracefulShutdown } = require('./gracefulShutdown');

test('closeServer resolves when the server is missing', async () => {
  await assert.doesNotReject(() => closeServer(null));
});

test('registerGracefulShutdown closes all servers and exits 0 on SIGTERM', async () => {
  const processRef = new EventEmitter();
  const closed = [];
  const exits = [];
  const logs = [];
  registerGracefulShutdown({
    servers: [
      { close: (done) => { closed.push('primary'); done(); } },
      { close: (done) => { closed.push('compat'); done(); } },
    ],
    processRef,
    exit: (code) => exits.push(code),
    logger: { log: (message) => logs.push(message) },
    setTimeoutFn: () => ({ unref() {} }),
    clearTimeoutFn: () => {},
  });

  processRef.emit('SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(closed, ['primary', 'compat']);
  assert.deepEqual(exits, [0]);
  assert.equal(logs.some((entry) => entry.includes('Received SIGTERM')), true);
});

test('registerGracefulShutdown exits 1 when a server fails to close', async () => {
  const processRef = new EventEmitter();
  const exits = [];
  const errors = [];
  registerGracefulShutdown({
    servers: [
      { close: (done) => done(new Error('close failed')) },
    ],
    processRef,
    exit: (code) => exits.push(code),
    logger: { error: (message) => errors.push(message) },
    setTimeoutFn: () => ({ unref() {} }),
    clearTimeoutFn: () => {},
  });

  processRef.emit('SIGINT');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(exits, [1]);
  assert.equal(errors.some((entry) => entry.includes('Failed to close all servers')), true);
});
