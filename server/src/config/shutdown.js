// Graceful shutdown orchestration.
//
// Decoupled from server.js so the lifecycle can be exercised in tests with
// injected dependencies: no real signals are sent, process.exit is mocked, and
// no database or listening socket is required.
//
// Lifecycle:
//   1. stop accepting new connections (server.close())
//      - idle keep-alive connections are closed eagerly so shutdown does not
//        wait on sockets that will never send another request
//      - in-flight requests are still allowed to finish
//   2. close the database connection (Mongoose disconnect)
//   3. exit 0 on success, exit 1 on cleanup error
// A bounded timer forces exit 1 if cleanup cannot finish, so the process can
// never hang during shutdown. Once the forced timeout has fired, the shutdown
// is terminal: late HTTP or database callbacks cannot start remaining cleanup
// work and cannot trigger a second exit. Repeated signals are ignored while
// shutting down so cleanup never runs twice.

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000;

/**
 * Stops accepting new connections and resolves once in-flight requests have
 * finished. Idle keep-alive connections are closed eagerly so they do not hold
 * up shutdown. Resolves immediately when no real server is provided.
 */
function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    if (!server || typeof server.close !== 'function') {
      resolve();
      return;
    }

    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });

    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
  });
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

/**
 * Builds a shutdown handler.
 *
 * @param {object}   deps
 * @param {object}   [deps.server]         http.Server returned by app.listen()
 * @param {Function} deps.closeDatabase    resolves once the DB is disconnected
 * @param {object}   [deps.logger]         console-compatible logger
 * @param {number}   [deps.timeoutMs]      bounded cleanup window in ms
 * @param {Function} [deps.exit]           process exit function (injected for tests)
 * @param {Function} [deps.setTimeoutFn]   timer factory (injected for tests)
 * @param {Function} [deps.clearTimeoutFn] timer cancellation (injected for tests)
 * @returns {(signal: string) => Promise<number>} resolves with the intended exit code
 */
function createShutdownHandler({
  server,
  closeDatabase,
  logger = console,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  exit = (code) => process.exit(code),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let shuttingDown = false;
  let forced = false;
  let exitInvoked = false;

  // exit is idempotent: after the first invocation (success, failure, or forced
  // timeout) no later callback can trigger a second process exit.
  const terminate = (code) => {
    if (exitInvoked) return;
    exitInvoked = true;
    exit(code);
  };

  return async function shutdown(signal) {
    if (shuttingDown) {
      // A repeated signal must not trigger a second cleanup pass.
      logger.warn(`Received ${signal} during shutdown; already shutting down.`);
      return 0;
    }
    shuttingDown = true;

    logger.log(`Received ${signal}. Starting graceful shutdown...`);

    // Bounded hard-stop: if cleanup cannot finish, the process must not hang.
    const timer = setTimeoutFn(() => {
      forced = true;
      logger.error(
        `Graceful shutdown did not finish within ${timeoutMs} ms; forcing exit.`
      );
      terminate(1);
    }, timeoutMs);

    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }

    let failure = null;

    // Best-effort cleanup: a failure in one step still attempts the other so
    // the database connection is not left dangling when the server misbehaves.
    try {
      await closeHttpServer(server);
    } catch (error) {
      failure = error;
      logger.error(`Error closing HTTP server: ${errorMessage(error)}`);
    }

    // Once the forced timeout has fired, remaining shutdown work must not be
    // started: a late server callback cannot begin database cleanup, and a late
    // database callback cannot trigger another exit.
    if (!forced) {
      try {
        await closeDatabase();
      } catch (error) {
        failure = failure || error;
        logger.error(`Error closing database connection: ${errorMessage(error)}`);
      }
    }

    clearTimeoutFn(timer);

    if (forced) {
      logger.warn('Graceful shutdown timed out; skipping remaining cleanup.');
      return 1;
    }

    if (failure) {
      logger.error('Graceful shutdown completed with errors.');
      terminate(1);
      return 1;
    }

    logger.log('Graceful shutdown complete.');
    terminate(0);
    return 0;
  };
}

module.exports = {
  createShutdownHandler,
  closeHttpServer,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
};