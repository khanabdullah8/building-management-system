process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '1000';

const express = require('express');
const request = require('supertest');
const morgan = require('morgan');

const app = require('../src/app');
const ApiError = require('../src/utils/ApiError');
const errorHandler = require('../src/middlewares/error');
const requestLogFormat = require('../src/middlewares/requestLogger');
const { createRateLimiter } = require('../src/middlewares/rateLimit');
const { connectDB, disconnectDB } = require('../src/config/db');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

// Captures console.error output so production log records can be asserted
// without printing synthetic markers. Callers must restore the returned spy.
function captureConsoleError() {
  const records = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    records.push(args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' '));
  });
  return { spy, records };
}

// Invokes the error handler directly (no HTTP stack) so individual errors can be
// fed in. Returns the mock response for assertions.
function invokeErrorHandler(err, { method = 'GET', path = '/probe' } = {}) {
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  const req = { method, path };
  errorHandler(err, req, res, vi.fn());
  return res;
}

describe('Phase 1 server', () => {
  let authToken;

  beforeAll(async () => {
    await startMemoryDb();
    const admin = await createTestAdmin();
    authToken = `Bearer ${getAuthToken(admin)}`;
  });

  afterAll(async () => {
    await removeTestAdmin();
    await stopMemoryDb();
  });

  describe('GET /api/health', () => {
    it('returns 200 with success and connected database', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('BMMS backend is running');
      expect(res.body.database).toBe('connected');
      expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /api/health/ready', () => {
    it('returns 200 when the database is connected', async () => {
      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.database).toBe('connected');
      expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('returns 503 when the database is disconnected', async () => {
      await disconnectDB();

      try {
        const res = await request(app).get('/api/health/ready');

        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.database).toBe('disconnected');
      } finally {
        await connectDB();
      }
    });
  });

  describe('Security headers (helmet)', () => {
    it('sends security headers on responses', async () => {
      const res = await request(app).get('/api/health');

      expect(res.headers['content-security-policy']).toBeTruthy();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeTruthy();
      expect(res.headers['referrer-policy']).toBeTruthy();
    });
  });

  describe('CORS', () => {
    it('allows a configured origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('does not allow a disallowed origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://evil.example.com');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Unknown routes', () => {
    it('returns a JSON 404 for unknown routes', async () => {
      const res = await request(app).get('/api/v1/nonexistent').set('Authorization', authToken);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Route not found/);
    });
  });

  describe('Rate limiting', () => {
    it('returns 429 after the limit is exceeded', async () => {
      const limitedApp = express();
      limitedApp.use(createRateLimiter({ windowMs: 60000, max: 3 }));
      limitedApp.get('/', (req, res) => res.json({ ok: true }));

      for (let i = 0; i < 3; i += 1) {
        const res = await request(limitedApp).get('/');
        expect(res.status).toBe(200);
      }

      const blocked = await request(limitedApp).get('/');
      expect(blocked.status).toBe(429);
      expect(blocked.body.success).toBe(false);
    });
  });

  describe('Error handler', () => {
    it('serializes ApiError responses with optional errors detail', async () => {
      const errApp = express();
      errApp.use((req, res, next) =>
        next(new ApiError(400, 'Invalid payload', { field: 'name' }))
      );
      errApp.use(errorHandler);

      const res = await request(errApp).get('/');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid payload');
      expect(res.body.errors).toEqual({ field: 'name' });
    });

    it('masks internal errors in production', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const errApp = express();
        errApp.use(() => {
          throw new Error('secret-stack-detail');
        });
        errApp.use(errorHandler);

        const res = await request(errApp).get('/');

        expect(res.status).toBe(500);
        expect(res.body.message).toBe('Internal server error');
        expect(JSON.stringify(res.body)).not.toContain('secret-stack-detail');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('surfaces client error messages (4xx)', async () => {
      const errApp = express();
      const err = new Error('Bad something');
      err.statusCode = 400;
      errApp.use(() => {
        throw err;
      });
      errApp.use(errorHandler);

      const res = await request(errApp).get('/');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Bad something');
    });

    it('logs sanitized 5xx errors in production without bodies, query strings, or tokens', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const errApp = express();
        errApp.use(express.json());
        errApp.use((req, res, next) => next(new Error('database write failed')));
        errApp.use(errorHandler);

        const res = await request(errApp)
          .post('/boom?token=super-secret-query')
          .set('Authorization', 'Bearer super-secret-header')
          .send({ password: 'super-secret-body' });

        expect(res.status).toBe(500);
        expect(res.body.message).toBe('Internal server error');
        expect(JSON.stringify(res.body)).not.toContain('database write failed');

        const logged = spy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(logged).toContain('POST');
        expect(logged).toContain('/boom');
        expect(logged).toContain('500');
        expect(logged).not.toContain('super-secret-query');
        expect(logged).not.toContain('super-secret-header');
        expect(logged).not.toContain('super-secret-body');
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('does not log 4xx client errors in production', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const errApp = express();
        errApp.use((req, res, next) => next(new ApiError(404, 'Not found')));
        errApp.use(errorHandler);

        const res = await request(errApp).get('/');

        expect(res.status).toBe(404);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('logs errors outside production (development visibility preserved)', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const errApp = express();
        errApp.use((req, res, next) => next(new Error('dev-visible-detail')));
        errApp.use(errorHandler);

        const res = await request(errApp).get('/');

        expect(res.status).toBe(500);
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('keeps the production 5xx response masked and omits raw message/body/query from logs', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { spy, records } = captureConsoleError();

      try {
        const errApp = express();
        errApp.use((req, res, next) => next(new Error('SYNTHETIC_MESSAGE_MARKER')));
        errApp.use(errorHandler);

        const res = await request(errApp)
          .post('/boom?secret=SYNTHETIC_QUERY_MARKER')
          .set('Authorization', 'Bearer SYNTHETIC_HEADER_MARKER')
          .send({ password: 'SYNTHETIC_BODY_MARKER' });

        expect(res.status).toBe(500);
        expect(res.body.message).toBe('Internal server error');
        expect(JSON.stringify(res.body)).not.toContain('SYNTHETIC_MESSAGE_MARKER');

        const logged = records.join('\n');
        expect(logged).not.toContain('SYNTHETIC_MESSAGE_MARKER');
        expect(logged).not.toContain('SYNTHETIC_QUERY_MARKER');
        expect(logged).not.toContain('SYNTHETIC_HEADER_MARKER');
        expect(logged).not.toContain('SYNTHETIC_BODY_MARKER');
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('omits raw stack traces from production logs', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { spy, records } = captureConsoleError();

      try {
        const err = new Error('boom');
        err.stack = 'Error: boom\n    at SYNTHETIC_STACK_MARKER (/app/server.js:1:1)';

        invokeErrorHandler(err);

        expect(records.join('\n')).not.toContain('SYNTHETIC_STACK_MARKER');
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('cannot forge additional records from multiline error messages', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { spy, records } = captureConsoleError();

      try {
        const errApp = express();
        errApp.use((req, res, next) =>
          next(new Error('first line\n[FORGED] second line\r\n[FORGED] third line'))
        );
        errApp.use(errorHandler);

        const res = await request(errApp).get('/');

        expect(res.status).toBe(500);
        expect(records).toHaveLength(1);
        expect(records[0]).not.toContain('\n');
        expect(records[0]).not.toContain('\r');
        expect(records[0]).not.toContain('[FORGED]');
        expect(() => JSON.parse(records[0])).not.toThrow();
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('neutralizes control characters in logged field values', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { spy, records } = captureConsoleError();

      try {
        invokeErrorHandler(new Error('boom'), { method: 'GET', path: '/safe\n[FORGED]' });

        expect(records).toHaveLength(1);
        expect(records[0]).not.toContain('\n');
        expect(JSON.parse(records[0]).path).toBe('/safe [FORGED]');
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('emits a structured production record with only allowlisted fields', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { spy, records } = captureConsoleError();

      try {
        invokeErrorHandler(new Error('boom'), { method: 'GET', path: '/api/v1/buildings' });

        expect(records).toHaveLength(1);
        const record = JSON.parse(records[0]);

        expect(record).toMatchObject({
          level: 'error',
          method: 'GET',
          path: '/api/v1/buildings',
          status: 500,
          error: 'Error',
        });
        expect(typeof record.timestamp).toBe('string');
        expect(new Date(record.timestamp).toString()).not.toBe('Invalid Date');
        expect(record.requestId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );

        const allowed = ['timestamp', 'level', 'requestId', 'method', 'path', 'status', 'error', 'code'];
        expect(Object.keys(record).every((key) => allowed.includes(key))).toBe(true);
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('includes only validated and bounded error codes', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { spy, records } = captureConsoleError();

      try {
        invokeErrorHandler(Object.assign(new Error('boom'), { code: 11000 }));
        expect(JSON.parse(records[0]).code).toBe('11000');

        records.length = 0;
        invokeErrorHandler(Object.assign(new Error('boom'), { code: { evil: true } }));
        expect(JSON.parse(records[0])).not.toHaveProperty('code');

        records.length = 0;
        invokeErrorHandler(Object.assign(new Error('boom'), { code: 'x'.repeat(120) }));
        expect(JSON.parse(records[0]).code).toHaveLength(40);
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('returns a valid X-Request-Id on 5xx that matches the log record', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { spy, records } = captureConsoleError();

      try {
        const errApp = express();
        errApp.use((req, res, next) => next(new Error('boom')));
        errApp.use(errorHandler);

        const res = await request(errApp).get('/');

        expect(res.status).toBe(500);
        const header = res.headers['x-request-id'];
        expect(header).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
        expect(JSON.parse(records[0]).requestId).toBe(header);
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('leaves 4xx ApiError responses and logging unchanged in production', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { spy, records } = captureConsoleError();

      try {
        const errApp = express();
        errApp.use((req, res, next) => next(new ApiError(400, 'Invalid payload', { field: 'name' })));
        errApp.use(errorHandler);

        const res = await request(errApp).get('/');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          success: false,
          message: 'Invalid payload',
          errors: { field: 'name' },
        });
        expect(res.headers['x-request-id']).toBeUndefined();
        expect(records).toHaveLength(0);
      } finally {
        spy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });
});

describe('request logging (Morgan)', () => {
  function captureMorganStream() {
    const lines = [];
    const stream = {
      write(line) {
        lines.push(String(line));
        return true;
      },
    };
    return { lines, stream };
  }

  function makeLogApp(stream) {
    const logApp = express();
    logApp.use(morgan(requestLogFormat, { stream }));
    return logApp;
  }

  it('excludes a synthetic email query value from the request log', async () => {
    const { lines, stream } = captureMorganStream();
    const logApp = makeLogApp(stream);

    logApp.get('/api/payments', (req, res) => res.json({ data: [{ email: req.query.email }] }));

    await request(logApp).get('/api/payments?email=SYNTHETIC_EMAIL_MARKER');

    const logged = lines.join('');
    expect(logged).not.toContain('SYNTHETIC_EMAIL_MARKER');
    expect(logged).toContain('/api/payments');
  });

  it('excludes a synthetic token query value from the request log', async () => {
    const { lines, stream } = captureMorganStream();
    const logApp = makeLogApp(stream);

    logApp.get('/api/auth/example', (req, res) => res.json({ ok: true }));

    await request(logApp).get('/api/auth/example?token=SYNTHETIC_TOKEN');

    const logged = lines.join('');
    expect(logged).not.toContain('SYNTHETIC_TOKEN');
    expect(logged).toContain('/api/auth/example');
  });

  it('excludes a synthetic search query value from the request log', async () => {
    const { lines, stream } = captureMorganStream();
    const logApp = makeLogApp(stream);

    logApp.get('/api/residents', (req, res) => res.json({ data: [] }));

    await request(logApp).get('/api/residents?search=SYNTHETIC_SEARCH_MARKER');

    const logged = lines.join('');
    expect(logged).not.toContain('SYNTHETIC_SEARCH_MARKER');
    expect(logged).toContain('/api/residents');
  });

  it('retains pathname, method, status, response time, and content length', async () => {
    const { lines, stream } = captureMorganStream();
    const logApp = makeLogApp(stream);

    logApp.get('/api/buildings', (req, res) => res.json({ data: [] }));

    await request(logApp).get('/api/buildings');

    const logged = lines.join('');
    expect(logged).toContain('/api/buildings');
    expect(logged).toMatch(/\bGET\b/);
    expect(logged).toMatch(/\b200\b/);
    expect(logged).toMatch(/\d+\.\d+ ms/);

    const contentLength = logged.trim().split(' - ')[1];
    expect(Number(contentLength)).toBeGreaterThan(0);
  });

  it('does not interfere with a normal response or a masked 500 response', async () => {
    const { lines, stream } = captureMorganStream();
    const logApp = makeLogApp(stream);

    logApp.get('/ok', (req, res) => res.json({ ok: true }));
    logApp.get('/boom', (req, res, next) => next(new Error('INTERNAL_DETAIL_MARKER')));
    logApp.use(errorHandler);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const okRes = await request(logApp).get('/ok');
      expect(okRes.status).toBe(200);

      const errRes = await request(logApp).get('/boom?secret=SYNTHETIC_QUERY_MARKER');
      expect(errRes.status).toBe(500);
      expect(errRes.body.message).toBe('Internal server error');
      expect(JSON.stringify(errRes.body)).not.toContain('INTERNAL_DETAIL_MARKER');

      const logged = lines.join('');
      expect(logged).toContain('/ok');
      expect(logged).toContain('/boom');
      expect(logged).not.toContain('SYNTHETIC_QUERY_MARKER');
      expect(logged).not.toContain('INTERNAL_DETAIL_MARKER');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps request logging skipped in the test environment', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);

      const writes = writeSpy.mock.calls
        .map((call) => String(call[0]))
        .join('');
      expect(writes).not.toContain('/api/health');
    } finally {
      writeSpy.mockRestore();
    }
  });
});
