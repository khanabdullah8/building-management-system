process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken } = require('./helpers/auth');

describe('User API (/api/v1/users)', () => {
  let adminToken;
  let staffToken;
  let staffUser;

  beforeAll(async () => {
    await startMemoryDb();
    const admin = await createTestAdmin();
    adminToken = `Bearer ${getAuthToken(admin)}`;

    staffUser = await User.create({
      name: 'Staff User',
      email: 'staff@test.local',
      password: 'password123',
      role: 'staff',
      status: 'active',
    });
    staffToken = `Bearer ${getAuthToken(staffUser)}`;
  });

  afterAll(async () => {
    if (staffUser) await User.findByIdAndDelete(staffUser._id);
    await removeTestAdmin();
    await stopMemoryDb();
  });

  describe('GET /api/v1/users', () => {
    it('returns users list for admin', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/users');
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', staffToken);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/users', () => {
    it('admin creates a user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', adminToken)
        .send({
          name: 'New User',
          email: 'newuser@test.local',
          password: 'password123',
          role: 'resident',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('newuser@test.local');
      expect(res.body.data.password).toBeUndefined();

      await User.deleteMany({ email: 'newuser@test.local' });
    });

    it('returns 400 for duplicate email', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', adminToken)
        .send({
          name: 'Dup User',
          email: staffUser.email,
          password: 'password123',
          role: 'resident',
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 for short password', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', adminToken)
        .send({
          name: 'Short',
          email: 'short@test.local',
          password: '1234567',
          role: 'resident',
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', adminToken)
        .send({ name: 'No Fields' });

      expect(res.status).toBe(400);
    });

    it('returns 403 for non-admin', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', staffToken)
        .send({
          name: 'Staff Attempt',
          email: 'staffattempt@test.local',
          password: 'password123',
          role: 'resident',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('admin gets user by id', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${staffUser._id}`)
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('staff@test.local');
    });

    it('returns 404 for nonexistent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/v1/users/${fakeId}`)
        .set('Authorization', adminToken);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    it('admin updates user', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${staffUser._id}`)
        .set('Authorization', adminToken)
        .send({ name: 'Staff Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Staff Updated');

      staffUser = await User.findById(staffUser._id);
    });

    it('admin updates user role', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${staffUser._id}`)
        .set('Authorization', adminToken)
        .send({ role: 'resident' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('resident');

      staffUser = await User.findById(staffUser._id);
    });

    it('returns 404 for nonexistent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .patch(`/api/v1/users/${fakeId}`)
        .set('Authorization', adminToken)
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('admin deletes user', async () => {
      const temp = await User.create({
        name: 'Delete Me',
        email: 'deleteme@test.local',
        password: 'password123',
        role: 'resident',
        status: 'active',
      });

      const res = await request(app)
        .delete(`/api/v1/users/${temp._id}`)
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      const gone = await User.findById(temp._id);
      expect(gone).toBeNull();
    });

    it('returns 400 when deleting own account', async () => {
      const admin = await User.findOne({ email: 'testadmin@test.local' });
      const res = await request(app)
        .delete(`/api/v1/users/${admin._id}`)
        .set('Authorization', adminToken);

      expect(res.status).toBe(400);
    });

    it('returns 404 for nonexistent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .delete(`/api/v1/users/${fakeId}`)
        .set('Authorization', adminToken);

      expect(res.status).toBe(404);
    });

    it('returns 403 for non-admin', async () => {
      const temp = await User.create({
        name: 'Staff Delete',
        email: 'staffdelete@test.local',
        password: 'password123',
        role: 'resident',
        status: 'active',
      });

      const res = await request(app)
        .delete(`/api/v1/users/${temp._id}`)
        .set('Authorization', staffToken);

      expect(res.status).toBe(403);

      await User.findByIdAndDelete(temp._id);
    });
  });
});
