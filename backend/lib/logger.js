function serializeError(error) {
  if (!error) return undefined;
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
  };
}

function createLogger(options = {}) {
  const {
    consoleRef = console,
    ...baseContext
  } = options;

  function write(level, event, context = {}, error) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...baseContext,
      ...context,
    };
    const serializedError = serializeError(error);
    if (serializedError) {
      entry.error = serializedError;
    }

    const line = JSON.stringify(entry);
    if (level === 'error' && typeof consoleRef.error === 'function') {
      consoleRef.error(line);
      return;
    }
    if (level === 'warn' && typeof consoleRef.warn === 'function') {
      consoleRef.warn(line);
      return;
    }
    if (typeof consoleRef.log === 'function') {
      consoleRef.log(line);
    }
  }

  return {
    child(context = {}) {
      return createLogger({ consoleRef, ...baseContext, ...context });
    },
    log(event, context = {}) {
      write('info', event, context);
    },
    info(event, context = {}) {
      write('info', event, context);
    },
    warn(event, context = {}, error) {
      write('warn', event, context, error);
    },
    error(event, context = {}, error) {
      write('error', event, context, error);
    },
  };
}

module.exports = {
  createLogger,
};
