function closeServer(server) {
  if (!server || typeof server.close !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.close((error) => {
      resolve(error || null);
    });
  });
}

function logMessage(logger, method, message, error) {
  if (typeof logger?.[method] === 'function') {
    if (error === undefined) {
      logger[method](message);
      return;
    }
    logger[method](message, error);
    return;
  }

  if (typeof logger?.log === 'function') {
    if (error === undefined) {
      logger.log(message);
      return;
    }
    logger.log(message, error);
  }
}

function registerGracefulShutdown(options) {
  const {
    servers,
    processRef = process,
    logger = console,
    exit = process.exit.bind(process),
    timeoutMs = 10_000,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = options;
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logMessage(logger, 'log', `[shutdown] Received ${signal}, closing servers...`);

    const timer = setTimeoutFn(() => {
      logMessage(logger, 'error', '[shutdown] Timed out while closing servers');
      exit(1);
    }, timeoutMs);

    if (typeof timer?.unref === 'function') {
      timer.unref();
    }

    const errors = (await Promise.all(servers.map(closeServer))).filter(Boolean);
    clearTimeoutFn(timer);

    if (errors.length > 0) {
      logMessage(logger, 'error', '[shutdown] Failed to close all servers', errors[0]);
      exit(1);
      return;
    }

    logMessage(logger, 'log', '[shutdown] Servers closed cleanly');
    exit(0);
  }

  processRef.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  processRef.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  return shutdown;
}

module.exports = {
  closeServer,
  registerGracefulShutdown,
};
