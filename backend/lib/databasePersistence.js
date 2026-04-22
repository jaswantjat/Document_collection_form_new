const fs = require('fs');
const path = require('path');

function atomicWriteFileSync(filePath, contents) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, contents, 'utf8');
  fs.renameSync(tempPath, filePath);
}

async function atomicWriteFile(filePath, contents) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tempPath, contents, 'utf8');
  await fs.promises.rename(tempPath, filePath);
}

function parseDatabaseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Database file ${filePath} did not contain an object.`);
  }
  if (!parsed.projects || typeof parsed.projects !== 'object' || Array.isArray(parsed.projects)) {
    parsed.projects = {};
  }
  return parsed;
}

function createDatabasePersistence({
  dbFile,
  backupFile = path.join(path.dirname(dbFile), 'db.last-known-good.json'),
  createDefaultDatabase,
  postProcessDatabase = () => false,
  logger = console,
}) {
  const status = {
    ready: false,
    dbFile,
    backupFile,
    lastLoadSource: 'default',
    lastLoadError: null,
    lastSaveError: null,
    lastSavedAt: null,
    pendingWrite: false,
  };

  function logInfo(event, context) {
    if (typeof logger?.info === 'function') {
      logger.info(event, context);
      return;
    }
    logger.log?.(event, context);
  }

  function logWarn(event, context, error) {
    if (typeof logger?.warn === 'function') {
      logger.warn(event, context, error);
      return;
    }
    logger.warn?.(event, context, error);
  }

  function loadDatabase() {
    let database = null;
    let restoredFromBackup = false;

    if (fs.existsSync(dbFile)) {
      try {
        database = parseDatabaseFile(dbFile);
        status.lastLoadSource = 'primary';
      } catch (error) {
        status.lastLoadError = error.message;
        logWarn('db.load_failed', { dbFile }, error);
      }
    }

    if (!database && fs.existsSync(backupFile)) {
      try {
        database = parseDatabaseFile(backupFile);
        status.lastLoadSource = 'backup';
        restoredFromBackup = true;
        logWarn('db.recovered_from_backup', { dbFile, backupFile });
      } catch (error) {
        status.lastLoadError = `${status.lastLoadError || ''} Backup load failed: ${error.message}`.trim();
        logWarn('db.backup_load_failed', { backupFile }, error);
      }
    }

    if (!database) {
      database = createDefaultDatabase();
      status.lastLoadSource = 'default';
      logInfo('db.started_with_default', { dbFile });
    }

    const changed = postProcessDatabase(database) === true;
    if (changed || restoredFromBackup || !fs.existsSync(dbFile) || !fs.existsSync(backupFile)) {
      const snapshot = JSON.stringify(database, null, 2);
      atomicWriteFileSync(dbFile, snapshot);
      atomicWriteFileSync(backupFile, snapshot);
      status.lastSavedAt = new Date().toISOString();
    }

    status.ready = true;
    return database;
  }

  const database = loadDatabase();
  let saveWriting = false;
  let saveDirty = false;
  const idleWaiters = [];

  function resolveIdleWaiters() {
    if (saveWriting || saveDirty) return;
    while (idleWaiters.length > 0) {
      idleWaiters.shift()?.();
    }
  }

  function getStatus() {
    return {
      ...status,
      pendingWrite: saveWriting || saveDirty,
    };
  }

  function saveDatabase() {
    saveDirty = true;
    status.pendingWrite = true;
    if (saveWriting) return;

    const doWrite = async () => {
      if (!saveDirty) {
        status.pendingWrite = false;
        resolveIdleWaiters();
        return;
      }

      saveDirty = false;
      saveWriting = true;
      const snapshot = JSON.stringify(database, null, 2);

      try {
        await atomicWriteFile(dbFile, snapshot);
        await atomicWriteFile(backupFile, snapshot);
        status.lastSavedAt = new Date().toISOString();
        status.lastSaveError = null;
      } catch (error) {
        status.lastSaveError = error.message;
        logWarn('db.save_failed', { dbFile, backupFile }, error);
      } finally {
        saveWriting = false;
        status.pendingWrite = saveDirty;
        if (saveDirty) {
          void doWrite();
          return;
        }
        resolveIdleWaiters();
      }
    };

    setImmediate(() => {
      void doWrite();
    });
  }

  async function flushPendingWrites() {
    if (!saveWriting && !saveDirty) return;
    await new Promise((resolve) => idleWaiters.push(resolve));
  }

  return {
    database,
    saveDatabase,
    flushPendingWrites,
    getStatus,
  };
}

module.exports = {
  createDatabasePersistence,
};
