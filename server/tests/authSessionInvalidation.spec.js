process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');
const { JWT_SECRET } = require('../src/config/env');

describe('Phase 34: Auth session invalidation on role/status changes', () => {
  let adminUser;

  const login = async (email) => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    expect(res.status).toBe(200);
    return res.body.data.token;
  };

  const signToken = (user, tokenVersion) =>
    jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        tokenVersion,
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

  const createTarget = async (suffix, role, status = 'active') =>
    User.create({
      name: `Target ${suffix}`,
      email: `target-${suffix}@test.local`,
      password: 'password123',
      role,
      status,
    });

  const adminPatch = async (id, body) =>
    request(app)
      .patch(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
      .send(body);

  const me = (token) =>
    request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    await startMemoryDb();
    adminUser = await User.create({
      name: 'Phase34 Admin',
      email: 'phase34-admin@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $regex: /target-.*@test\.local$/ } });
    await User.findByIdAndDelete(adminUser._id);
    await stopMemoryDb();
  });

  it('A: role change invalidates the old token', async () => {
    const target = await createTarget('rolechange', 'staff');
    const oldToken = signToken(target, 0);

    const res = await adminPatch(target._id, { role: 'resident' });
    expect(res.status).toBe(200);

    const m = await me(oldToken);
    expect(m.status).toBe(401);
  });

  it('B: status/deactivation invalidates the old token immediately and blocks login', async () => {
    const target = await createTarget('deactivate', 'staff');
    const oldToken = signToken(target, 0);

    const res = await adminPatch(target._id, { status: 'inactive' });
    expect(res.status).toBe(200);

    const m = await me(oldToken);
    expect(m.status).toBe(401);

    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: target.email, password: 'password123' });
    expect(blocked.status).toBe(401);
  });

  it('C: deactivation invalidates all sessions (logout-everywhere semantics)', async () => {
    const target = await createTarget('allsessions', 'staff');
    const tokenOne = signToken(target, 0);
    const tokenTwo = signToken(target, 0);

    await adminPatch(target._id, { status: 'inactive' });

    const first = await me(tokenOne);
    expect(first.status).toBe(401);

    const second = await me(tokenTwo);
    expect(second.status).toBe(401);
  });

  it('D: reactivation requires fresh authentication; the old JWT is NOT restored', async () => {
    const target = await createTarget('reactivate', 'staff');
    const oldToken = signToken(target, 0);

    const deactivate = await adminPatch(target._id, { status: 'inactive' });
    expect(deactivate.status).toBe(200);

    const reactivate = await adminPatch(target._id, { status: 'active' });
    expect(reactivate.status).toBe(200);

    const stale = await me(oldToken);
    expect(stale.status).toBe(401);

    const freshToken = await login(target.email);
    const m = await me(freshToken);
    expect(m.status).toBe(200);
    expect(m.body.data.user.status).toBe('active');
  });

  it('E: unrelated profile update does NOT invalidate the token', async () => {
    const target = await createTarget('unrelated', 'staff');
    const token = signToken(target, 0);

    const res = await adminPatch(target._id, { name: 'Renamed Target' });
    expect(res.status).toBe(200);

    const m = await me(token);
    expect(m.status).toBe(200);
  });

  it('F: fresh login after role change uses the new DB role (RBAC intact)', async () => {
    const target = await createTarget('rbac', 'staff');
    await adminPatch(target._id, { role: 'resident' });

    const freshToken = await login(target.email);

    const m = await me(freshToken);
    expect(m.status).toBe(200);
    expect(m.body.data.user.role).toBe('resident');

    const users = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${freshToken}`);
    expect(users.status).toBe(403);
  });

  it('G: tokenVersion is bumped, so a stale manually-signed token is rejected', async () => {
    const target = await createTarget('stalesign', 'staff');
    const staleSigned = signToken(target, 0);

    const res = await adminPatch(target._id, { role: 'resident' });
    expect(res.status).toBe(200);

    const reloaded = await User.findById(target._id);
    expect(reloaded.tokenVersion).toBe(1);

    const m = await me(staleSigned);
    expect(m.status).toBe(401);
  });
});
