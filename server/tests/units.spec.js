process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Units API (/api/v1/units)', () => {
  let authToken;
  let sampleBuilding;
  let secondaryBuilding;

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
    await Unit.deleteMany({});
    await Building.deleteMany({});

    sampleBuilding = await Building.create({
      code: 'BLD-A',
      name: 'Greenwood Heights',
      address: '12 Palm Avenue',
      units: 0,
    });

    secondaryBuilding = await Building.create({
      code: 'BLD-B',
      name: 'Maple Residency',
      address: '88 Maple Street',
      units: 0,
    });
  });

  describe('POST /api/v1/units', () => {
    it('creates a new unit and increments building units count', async () => {
      const payload = {
        unitNumber: 'A-1101',
        building: sampleBuilding._id.toString(),
        type: '3BHK',
        floor: 11,
        status: 'occupied',
      };

      const res = await authRequest(app, authToken)
        .post('/api/v1/units')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unitNumber).toBe('A-1101');
      expect(res.body.data.building.code).toBe('BLD-A');
      expect(res.body.data.id).toBeTruthy();

      const updatedBuilding = await Building.findById(sampleBuilding._id);
      expect(updatedBuilding.units).toBe(1);
    });

    it('fails validation when unitNumber is missing', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/units')
        .send({ building: sampleBuilding._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/unit number is required/i);
    });

    it('fails validation when building ID is missing or invalid', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/units')
        .send({ unitNumber: 'A-101', building: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects creation when referenced building does not exist', async () => {
      const nonExistentBuildingId = new mongoose.Types.ObjectId().toString();

      const res = await authRequest(app, authToken)
        .post('/api/v1/units')
        .send({ unitNumber: 'A-101', building: nonExistentBuildingId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/referenced building does not exist/i);
    });

    it('rejects duplicate unitNumber within the same building', async () => {
      await authRequest(app, authToken)
        .post('/api/v1/units')
        .send({ unitNumber: 'A-1101', building: sampleBuilding._id.toString() });

      const duplicateRes = await authRequest(app, authToken)
        .post('/api/v1/units')
        .send({ unitNumber: 'a-1101', building: sampleBuilding._id.toString() });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.success).toBe(false);
      expect(duplicateRes.body.message).toMatch(/already exists in this building/i);
    });

    it('allows same unitNumber in a different building', async () => {
      const res1 = await authRequest(app, authToken)
        .post('/api/v1/units')
        .send({ unitNumber: '101', building: sampleBuilding._id.toString() });

      const res2 = await authRequest(app, authToken)
        .post('/api/v1/units')
        .send({ unitNumber: '101', building: secondaryBuilding._id.toString() });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
    });
  });

  describe('GET /api/v1/units', () => {
    it('returns empty list when no units exist', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/units');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns all units with populated building data', async () => {
      await Unit.create([
        { unitNumber: 'A-1101', building: sampleBuilding._id, type: '3BHK', floor: 11 },
        { unitNumber: 'B-0901', building: secondaryBuilding._id, type: '2BHK', floor: 9 },
      ]);

      const res = await authRequest(app, authToken).get('/api/v1/units');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].building.code).toBeTruthy();
    });

    it('filters units by building ID, status, and search string', async () => {
      await Unit.create([
        { unitNumber: 'A-1101', building: sampleBuilding._id, type: '3BHK', status: 'occupied' },
        { unitNumber: 'A-1102', building: sampleBuilding._id, type: '2BHK', status: 'vacant' },
        { unitNumber: 'B-0901', building: secondaryBuilding._id, type: '2BHK', status: 'occupied' },
      ]);

      const resBuildingFilter = await authRequest(app, authToken).get(`/api/v1/units?building=${sampleBuilding._id}`);
      expect(resBuildingFilter.body.data.length).toBe(2);

      const resStatusFilter = await authRequest(app, authToken).get('/api/v1/units?status=vacant');
      expect(resStatusFilter.body.data.length).toBe(1);
      expect(resStatusFilter.body.data[0].unitNumber).toBe('A-1102');

      const resSearch = await authRequest(app, authToken).get('/api/v1/units?search=3BHK');
      expect(resSearch.body.data.length).toBe(1);
      expect(resSearch.body.data[0].unitNumber).toBe('A-1101');
    });
  });

  describe('GET /api/v1/units/:id', () => {
    it('returns single unit by ID with populated building', async () => {
      const created = await Unit.create({
        unitNumber: 'C-0501',
        building: sampleBuilding._id,
        type: '1BHK',
        floor: 5,
      });

      const res = await authRequest(app, authToken).get(`/api/v1/units/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unitNumber).toBe('C-0501');
      expect(res.body.data.building.name).toBe('Greenwood Heights');
    });

    it('returns 404 for invalid or non-existent unit ID', async () => {
      const resInvalid = await authRequest(app, authToken).get('/api/v1/units/invalid-id');
      expect(resInvalid.status).toBe(404);

      const validNonExistentId = new mongoose.Types.ObjectId().toString();
      const resMissing = await authRequest(app, authToken).get(`/api/v1/units/${validNonExistentId}`);
      expect(resMissing.status).toBe(404);
      expect(resMissing.body.message).toBe('Unit not found');
    });
  });

  describe('PATCH /api/v1/units/:id', () => {
    it('updates unit details successfully', async () => {
      const created = await Unit.create({
        unitNumber: 'A-101',
        building: sampleBuilding._id,
        status: 'vacant',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/units/${created._id}`)
        .send({ status: 'occupied', floor: 2 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('occupied');
      expect(res.body.data.floor).toBe(2);
    });

    it('returns 404 when updating non-existent unit', async () => {
      const validNonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/units/${validNonExistentId}`)
        .send({ status: 'occupied' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Unit not found');
    });
  });

  describe('DELETE /api/v1/units/:id', () => {
    it('deletes unit successfully and decrements building units count', async () => {
      const created = await Unit.create({
        unitNumber: 'A-999',
        building: sampleBuilding._id,
      });
      await Building.findByIdAndUpdate(sampleBuilding._id, { $inc: { units: 1 } });

      const res = await authRequest(app, authToken).delete(`/api/v1/units/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Unit deleted successfully');

      const found = await Unit.findById(created._id);
      expect(found).toBeNull();

      const updatedBuilding = await Building.findById(sampleBuilding._id);
      expect(updatedBuilding.units).toBe(0);
    });

    it('returns 404 when deleting a valid ObjectId that does not exist', async () => {
      const validNonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await authRequest(app, authToken).delete(`/api/v1/units/${validNonExistentId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unit not found');
    });

    it('returns 404 when deleting an invalid unit ID format', async () => {
      const res = await authRequest(app, authToken).delete('/api/v1/units/invalid-id-format');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unit not found');
    });
  });
});
