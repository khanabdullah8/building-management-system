process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Building API (/api/v1/buildings)', () => {
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

  beforeEach(async () => {
    await Building.deleteMany({});
  });

  describe('POST /api/v1/buildings', () => {
    it('creates a new building successfully', async () => {
      const payload = {
        code: 'BLD-A',
        name: 'Greenwood Heights',
        address: '12 Palm Avenue',
        units: 72,
        status: 'active',
      };

      const res = await authRequest(app, authToken)
        .post('/api/v1/buildings')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Building created successfully');
      expect(res.body.data).toMatchObject({
        code: 'BLD-A',
        name: 'Greenwood Heights',
        address: '12 Palm Avenue',
        units: 72,
        status: 'active',
      });
      expect(res.body.data.id).toBeTruthy();
    });

    it('fails validation when required fields are missing', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/buildings')
        .send({ name: 'Building without code' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Building code is required');
    });

    it('fails validation when units is negative', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/buildings')
        .send({ code: 'BLD-X', name: 'Test', units: -5 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/non-negative/);
    });

    it('rejects creation of duplicate building code', async () => {
      await Building.create({
        code: 'BLD-A',
        name: 'Greenwood Heights',
        address: '12 Palm Avenue',
        units: 72,
      });

      const res = await authRequest(app, authToken)
        .post('/api/v1/buildings')
        .send({
          code: 'bld-a', // Lowercase test, should format to uppercase and collide
          name: 'Another Greenwood',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/);
    });
  });

  describe('GET /api/v1/buildings', () => {
    it('returns an empty array when no buildings exist', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/buildings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns list of all buildings', async () => {
      await Building.create([
        { code: 'BLD-A', name: 'Greenwood Heights', units: 72 },
        { code: 'BLD-B', name: 'Maple Residency', units: 64 },
      ]);

      const res = await authRequest(app, authToken).get('/api/v1/buildings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('supports search query parameter', async () => {
      await Building.create([
        { code: 'BLD-A', name: 'Greenwood Heights', address: '12 Palm Avenue' },
        { code: 'BLD-B', name: 'Maple Residency', address: '88 Maple Street' },
      ]);

      const res = await authRequest(app, authToken).get('/api/v1/buildings?search=Greenwood');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].code).toBe('BLD-A');
    });
  });

  describe('GET /api/v1/buildings/:id', () => {
    it('returns single building by ID', async () => {
      const created = await Building.create({
        code: 'BLD-C',
        name: 'Sunset Towers',
        units: 48,
      });

      const res = await authRequest(app, authToken).get(`/api/v1/buildings/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('BLD-C');
      expect(res.body.data.name).toBe('Sunset Towers');
    });

    it('returns 404 for non-existent or invalid building ID', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/buildings/507f1f77bcf86cd799439011');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Building not found');
    });
  });

  describe('PATCH /api/v1/buildings/:id', () => {
    it('updates building fields successfully', async () => {
      const created = await Building.create({
        code: 'BLD-D',
        name: 'Cedar Courts',
        units: 52,
        status: 'inactive',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/buildings/${created._id}`)
        .send({ status: 'active', units: 55 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.units).toBe(55);
    });

    it('returns 404 when updating non-existent building', async () => {
      const res = await authRequest(app, authToken)
        .patch('/api/v1/buildings/507f1f77bcf86cd799439011')
        .send({ name: 'Non Existent' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/buildings/:id', () => {
    it('deletes building successfully', async () => {
      const created = await Building.create({
        code: 'BLD-DEL',
        name: 'ToDelete',
      });

      const res = await authRequest(app, authToken).delete(`/api/v1/buildings/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Building deleted successfully');

      const found = await Building.findById(created._id);
      expect(found).toBeNull();
    });

    it('returns 404 when deleting a valid ObjectId that does not exist', async () => {
      const validNonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await authRequest(app, authToken).delete(`/api/v1/buildings/${validNonExistentId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Building not found');
    });

    it('returns 404 when deleting an invalid building ID format', async () => {
      const res = await authRequest(app, authToken).delete('/api/v1/buildings/invalid-id-format');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Building not found');
    });
  });
});
