process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';
process.env.LOGIN_RATE_LIMIT_MAX = '5';

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');

describe('Phase 22: Login rate limiting', () => {
  let loginUser;

  beforeAll(async () => {
    await startMemoryDb();
    loginUser = await User.create({
      name: 'Rate User',
      email: 'rate@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });
  });

  afterAll(async () => {
    if (loginUser) await User.findByIdAndDelete(loginUser._id);
    await stopMemoryDb();
  });

  it('returns 429 on /auth/login once the login cap is exceeded', async () => {
    let res;
    for (let i = 0; i < 5; i += 1) {
      res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'rate@test.local', password: 'password123' });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rate@test.local', password: 'password123' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
  });

  it('does not apply the login limiter to authenticated non-login endpoints', async () => {
    const token = getAuthToken(loginUser);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    const buildings = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${token}`);
    expect(buildings.status).toBe(200);
  });
});
