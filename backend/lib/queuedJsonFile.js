const fs = require('fs');
const path = require('path');

function getTempFilePath(filePath) {
  return `${filePath}.${process.pid}.tmp`;
}

async function writeJsonAtomically(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempFilePath = getTempFilePath(filePath);
  const snapshot = JSON.stringify(value, null, 2);

  await fs.promises.writeFile(tempFilePath, snapshot, 'utf8');
  await fs.promises.rename(tempFilePath, filePath);
}

function settleWaiters(waiters, error) {
  for (const waiter of waiters) {
    if (error) {
      waiter.reject(error);
      continue;
    }

    waiter.resolve();
  }
}

function createQueuedJsonSaver({ writeSnapshot, onError }) {
  let running = false;
  let dirty = false;
  let waiters = [];

  async function runLoop() {
    if (running) return;
    running = true;
    let error = null;

    while (dirty) {
      dirty = false;
      try {
        await writeSnapshot();
      } catch (nextError) {
        error = nextError;
        onError?.(nextError);
      }
    }

    running = false;
    const currentWaiters = waiters;
    waiters = [];
    settleWaiters(currentWaiters, error);

    if (dirty) void runLoop();
  }

  return function save() {
    dirty = true;

    const waiter = new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });

    void runLoop();
    return waiter;
  };
}

module.exports = {
  createQueuedJsonSaver,
  writeJsonAtomically,
};
