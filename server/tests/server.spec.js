process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '1000';

const express = require('express');
const request = require('supertest');

const app = require('../src/app');
const ApiError = require('../src/utils/ApiError');
const errorHandler = require('../src/middlewares/error');
const { createRateLimiter } = require('../src/middlewares/rateLimit');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

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
  });
});
