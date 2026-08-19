process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { JWT_SECRET } = require('../src/config/env');

describe('Auth API (/api/v1/auth)', () => {
  let testUser;

  beforeAll(async () => {
    await startMemoryDb();
    testUser = await User.create({
      name: 'Auth Test User',
      email: 'authtest@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });
  });

  afterAll(async () => {
    if (testUser) await User.findByIdAndDelete(testUser._id);
    await stopMemoryDb();
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns token and user on valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'authtest@test.local', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('authtest@test.local');
      expect(res.body.data.user.password).toBeUndefined();
    });

    it('returns 401 for wrong email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@test.local', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'authtest@test.local', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for missing email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'authtest@test.local' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for inactive user', async () => {
      const inactive = await User.create({
        name: 'Inactive',
        email: 'inactive@test.local',
        password: 'password123',
        role: 'resident',
        status: 'inactive',
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'inactive@test.local', password: 'password123' });

      expect(res.status).toBe(401);
      await User.findByIdAndDelete(inactive._id);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns current user with valid token', async () => {
      const token = jwt.sign(
        { id: testUser._id.toString(), email: testUser.email, role: testUser.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('authtest@test.local');
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalidtoken123');

      expect(res.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const token = jwt.sign(
        { id: testUser._id.toString(), email: testUser.email, role: testUser.role },
        JWT_SECRET,
        { expiresIn: '0s' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns success with valid token', async () => {
      const token = jwt.sign(
        { id: testUser._id.toString(), email: testUser.email, role: testUser.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).post('/api/v1/auth/logout');
      expect(res.status).toBe(401);
    });
  });
});
