process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { JWT_SECRET } = require('../src/config/env');

describe('Phase 33: tokenVersion session revocation', () => {
  let sessionUser;

  const login = async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'session@test.local', password: 'password123' });
    expect(res.status).toBe(200);
    return res.body.data.token;
  };

  const signToken = (overrides = {}) =>
    jwt.sign(
      { id: sessionUser._id.toString(), email: sessionUser.email, role: sessionUser.role, ...overrides },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

  beforeAll(async () => {
    await startMemoryDb();
    sessionUser = await User.create({
      name: 'Session Test User',
      email: 'session@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });
  });

  afterAll(async () => {
    if (sessionUser) await User.findByIdAndDelete(sessionUser._id);
    await stopMemoryDb();
  });

  it('enables a fresh login to still authenticate (baseline)', async () => {
    const token = await login();

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('session@test.local');
  });

  it('B: logout revokes the exact token used', async () => {
    const token = await login();

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  it('C: revoked token cannot access a normal protected endpoint', async () => {
    const token = await login();

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const buildings = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${token}`);
    expect(buildings.status).toBe(401);
  });

  it('G: logout invalidates ALL active tokens (logout everywhere)', async () => {
    const tokenOne = await login();
    const tokenTwo = await login();

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokenOne}`);
    expect(logout.status).toBe(200);

    const first = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenOne}`);
    expect(first.status).toBe(401);

    const second = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenTwo}`);
    expect(second.status).toBe(401);
  });

  it('H: fresh login still works after revocation (RBAC/access intact)', async () => {
    const token = await login();

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    const buildings = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${token}`);
    expect(buildings.status).toBe(200);
  });

  it('rejects a token whose tokenVersion no longer matches the user', async () => {
    await User.findByIdAndUpdate(sessionUser._id, { tokenVersion: 5 });
    const staleToken = signToken({ tokenVersion: 4 });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${staleToken}`);
    expect(me.status).toBe(401);
  });

  it('accepts a token with no tokenVersion when user.tokenVersion is 0 (backward compat)', async () => {
    await User.findByIdAndUpdate(sessionUser._id, { tokenVersion: 0 });

    const legacyToken = jwt.sign(
      { id: sessionUser._id.toString(), email: sessionUser.email, role: sessionUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${legacyToken}`);
    expect(me.status).toBe(200);
  });

  it('rejects an invalid token', async () => {
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalidtoken123');
    expect(me.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expiredToken = jwt.sign(
      { id: sessionUser._id.toString(), email: sessionUser.email, role: sessionUser.role, tokenVersion: 0 },
      JWT_SECRET,
      { expiresIn: '0s' }
    );

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(me.status).toBe(401);
  });

  it('rejects an inactive user despite a valid token', async () => {
    await User.findByIdAndUpdate(sessionUser._id, { tokenVersion: 0 });
    const inactiveUser = await User.create({
      name: 'Inactive Session',
      email: 'inactive-session@test.local',
      password: 'password123',
      role: 'resident',
      status: 'inactive',
    });

    const token = signToken({ id: inactiveUser._id.toString(), email: inactiveUser.email, role: inactiveUser.role, tokenVersion: 0 });
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(me.status).toBe(401);
    await User.findByIdAndDelete(inactiveUser._id);
  });
});
