process.env.NODE_ENV = 'test';

const {
  createShutdownHandler,
  closeHttpServer,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
} = require('../src/config/shutdown');

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// Controllable fake timers: the timeout callback is captured so tests can
// fire it deterministically instead of waiting real time.
function makeTimers() {
  const state = { captured: null, cleared: [] };
  const timers = {
    setTimeoutFn: vi.fn((fn, ms) => {
      const handle = { fn, ms, unref: vi.fn() };
      state.captured = handle;
      return handle;
    }),
    clearTimeoutFn: vi.fn((handle) => {
      state.cleared.push(handle);
    }),
    fireTimeout() {
      if (state.captured) state.captured.fn();
    },
    get captured() {
      return state.captured;
    },
    get cleared() {
      return state.cleared;
    },
  };
  return timers;
}

function makeHandler({ server, closeDatabase, logger, timeoutMs }) {
  const exit = vi.fn();
  const timers = makeTimers();
  const sharedLogger = logger || makeLogger();
  const shutdown = createShutdownHandler({
    server,
    closeDatabase,
    logger: sharedLogger,
    timeoutMs,
    exit,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  return { shutdown, exit, timers, logger: sharedLogger };
}

describe('Phase 61 graceful shutdown', () => {
  it('SIGTERM closes the server, then the database, then exits 0', async () => {
    const order = [];
    const server = {
      close: vi.fn((cb) => {
        order.push('server.close');
        cb();
      }),
    };
    const closeDatabase = vi.fn(async () => {
      order.push('db.close');
    });
    const { shutdown, exit, timers } = makeHandler({ server, closeDatabase });

    const code = await shutdown('SIGTERM');

    expect(order).toEqual(['server.close', 'db.close']);
    expect(exit).toHaveBeenCalledWith(0);
    expect(code).toBe(0);
    expect(timers.cleared).toHaveLength(1);
  });

  it('SIGINT follows the same graceful path', async () => {
    const server = { close: vi.fn((cb) => cb()) };
    const closeDatabase = vi.fn(async () => {});
    const { shutdown, exit } = makeHandler({ server, closeDatabase });

    await shutdown('SIGINT');

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('waits for in-flight requests to finish before closing the database', async () => {
    let closeCallback;
    const server = {
      close: vi.fn((cb) => {
        closeCallback = cb;
      }),
      closeIdleConnections: vi.fn(),
    };
    const closeDatabase = vi.fn(async () => {});
    const { shutdown } = makeHandler({ server, closeDatabase });

    const pending = shutdown('SIGTERM');

    // Give the handler a chance to reach the await point.
    await Promise.resolve();
    expect(closeDatabase).not.toHaveBeenCalled();

    closeCallback();
    await pending;

    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
  });

  it('ignores repeated signals and does not run cleanup twice', async () => {
    const server = { close: vi.fn((cb) => cb()) };
    const closeDatabase = vi.fn(async () => {});
    const logger = makeLogger();
    const { shutdown, exit } = makeHandler({ server, closeDatabase, logger });

    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Received SIGINT during shutdown; already shutting down.'
    );
  });

  it('handles a server close error safely and still closes the database', async () => {
    const server = { close: vi.fn((cb) => cb(new Error('close boom'))) };
    const closeDatabase = vi.fn(async () => {});
    const logger = makeLogger();
    const { shutdown, exit } = makeHandler({ server, closeDatabase, logger });

    const code = await shutdown('SIGTERM');

    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(code).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error closing HTTP server')
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Graceful shutdown completed with errors.')
    );
  });

  it('handles a database cleanup error safely', async () => {
    const server = { close: vi.fn((cb) => cb()) };
    const closeDatabase = vi.fn(async () => {
      throw new Error('db boom');
    });
    const logger = makeLogger();
    const { shutdown, exit } = makeHandler({ server, closeDatabase, logger });

    const code = await shutdown('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
    expect(code).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error closing database connection')
    );
  });

  it('forces a bounded exit when cleanup does not finish in time', async () => {
    // server.close never invokes its callback, keeping shutdown pending.
    const server = { close: vi.fn(() => {}) };
    const closeDatabase = vi.fn(async () => {});
    const { shutdown, exit, timers, logger } = makeHandler({
      server,
      closeDatabase,
      timeoutMs: 1234,
    });

    const pending = shutdown('SIGTERM');

    expect(timers.captured.ms).toBe(1234);
    timers.fireTimeout();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(closeDatabase).not.toHaveBeenCalled();

    // A late HTTP close callback must not start remaining cleanup or exit again.
    server.close.mock.calls[0][0]();
    await pending;

    expect(closeDatabase).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Graceful shutdown timed out; skipping remaining cleanup.'
    );
  });

  it('forces a bounded exit when database cleanup never resolves', async () => {
    const server = { close: vi.fn((cb) => cb()) };
    // Database cleanup never settles; only the bounded timer can end shutdown.
    const closeDatabase = vi.fn(() => new Promise(() => {}));
    const { shutdown, exit, timers } = makeHandler({
      server,
      closeDatabase,
      timeoutMs: 4321,
    });

    const pending = shutdown('SIGTERM');

    // Let the handler reach the pending database await.
    await Promise.resolve();
    expect(timers.captured.ms).toBe(4321);

    timers.fireTimeout();

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);

    // The database promise never resolves; no continuation can run. Keep the
    // pending promise reference so the forced-exit path is left verifiable.
    pending.catch(() => {});
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('does not exit again when a late database callback completes after the forced timeout', async () => {
    let dbCallback;
    const server = { close: vi.fn((cb) => cb()) };
    const closeDatabase = vi.fn(
      () =>
        new Promise((resolve) => {
          dbCallback = resolve;
        })
    );
    const { shutdown, exit, timers } = makeHandler({
      server,
      closeDatabase,
      timeoutMs: 999,
    });

    const pending = shutdown('SIGTERM');

    await Promise.resolve();
    timers.fireTimeout();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);

    // Late database completion must not trigger a second exit or a repeated
    // database cleanup call.
    dbCallback();
    await pending;

    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('uses a bounded default timeout', () => {
    const server = { close: vi.fn((cb) => cb()) };
    const closeDatabase = vi.fn(async () => {});
    const { shutdown, timers } = makeHandler({ server, closeDatabase });

    shutdown('SIGTERM');

    expect(timers.captured.ms).toBe(DEFAULT_SHUTDOWN_TIMEOUT_MS);
  });

  it('clears the timeout after a successful shutdown', async () => {
    const server = { close: vi.fn((cb) => cb()) };
    const closeDatabase = vi.fn(async () => {});
    const { shutdown, timers } = makeHandler({ server, closeDatabase });

    await shutdown('SIGTERM');

    expect(timers.cleared).toHaveLength(1);
  });

  it('closeHttpServer resolves when no server is provided', async () => {
    await expect(closeHttpServer(undefined)).resolves.toBeUndefined();
    await expect(closeHttpServer(null)).resolves.toBeUndefined();
  });
});