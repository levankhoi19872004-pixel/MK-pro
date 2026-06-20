'use strict';

const mongoose = require('mongoose');

async function closeMongoForShutdown(timeoutMs, log = console, options = {}) {
  const connection = options.connection || mongoose.connection;
  const disconnect = options.disconnect || (() => mongoose.disconnect());
  const initialState = connection.readyState;
  if (initialState === 0) return { closed: true, forced: false, previousState: initialState };

  // A connection still in `connecting` can wait for the full server-selection
  // timeout. Abort the native client without blocking the process deadline.
  if (initialState === 2) {
    try {
      const client = connection.getClient?.();
      if (client?.close) {
        Promise.resolve(client.close(true)).catch((error) => {
          log.warn?.({ err: error }, 'Mongo connecting client force-close failed');
        });
      }
    } catch (error) {
      log.warn?.({ err: error }, 'Mongo connecting client could not be force-closed');
    }
    return { closed: false, forced: true, previousState: initialState };
  }

  const totalTimeoutMs = Math.max(1000, Number(timeoutMs) || 15000);
  const closeTimeoutMs = Math.max(500, Math.min(5000, Math.floor(totalTimeoutMs / 2)));
  let timer;
  try {
    await Promise.race([
      disconnect(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Mongo shutdown exceeded ${closeTimeoutMs}ms`);
          error.code = 'MONGO_SHUTDOWN_TIMEOUT';
          reject(error);
        }, closeTimeoutMs);
        timer.unref?.();
      })
    ]);
    return { closed: true, forced: false, previousState: initialState };
  } catch (error) {
    log.warn?.({ err: error, readyState: connection.readyState }, 'Mongo graceful close timed out; forcing client close');
    try {
      const client = connection.getClient?.();
      if (client?.close) Promise.resolve(client.close(true)).catch(() => null);
    } catch (_) { /* process shutdown continues */ }
    return { closed: false, forced: true, previousState: initialState };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { closeMongoForShutdown };
