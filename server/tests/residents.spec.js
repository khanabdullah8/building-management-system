process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Resident = require('../src/models/Resident');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Residents API (/api/v1/residents)', () => {
  let authToken;
  let sampleBuilding;
  let secondaryBuilding;
  let sampleUnit;
  let secondaryUnit;

  const validPayload = () => ({
    name: 'Rahul Sharma',
    unit: sampleUnit._id.toString(),
    phone: '+91 98123 45670',
    type: 'owner',
    status: 'active',
  });

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
    await Resident.deleteMany({});
    await Unit.deleteMany({});
    await Building.deleteMany({});

    sampleBuilding = await Building.create({
      code: 'BLD-A',
      name: 'Greenwood Heights',
    });
    secondaryBuilding = await Building.create({
      code: 'BLD-B',
      name: 'Maple Residency',
    });
    sampleUnit = await Unit.create({
      unitNumber: 'A-1101',
      building: sampleBuilding._id,
    });
    secondaryUnit = await Unit.create({
      unitNumber: 'B-0901',
      building: secondaryBuilding._id,
    });
  });

  describe('POST /api/v1/residents', () => {
    it('creates a Resident with populated Unit and Building data', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/residents').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Resident created successfully');
      expect(res.body.data).toMatchObject({
        name: 'Rahul Sharma',
        phone: '+91 98123 45670',
        type: 'owner',
        status: 'active',
        unit: {
          unitNumber: 'A-1101',
          building: { name: 'Greenwood Heights', code: 'BLD-A' },
        },
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.unit.id).toBeTruthy();
      expect(res.body.data.unit.building.id).toBeTruthy();
    });

    it('rejects missing and empty names', async () => {
      const missing = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), name: undefined });
      const empty = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), name: '   ' });

      expect(missing.status).toBe(400);
      expect(missing.body.errors.name).toBeTruthy();
      expect(empty.status).toBe(400);
      expect(empty.body.errors.name).toBeTruthy();
    });

    it('rejects missing, invalid, and nonexistent Unit IDs', async () => {
      const missing = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), unit: undefined });
      const invalid = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), unit: 'invalid-id' });
      const nonexistent = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), unit: new mongoose.Types.ObjectId().toString() });

      expect(missing.status).toBe(400);
      expect(invalid.status).toBe(400);
      expect(nonexistent.status).toBe(400);
      expect(nonexistent.body.message).toMatch(/referenced unit does not exist/i);
    });

    it('rejects non-string phone values and accepts an omitted phone', async () => {
      const invalid = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), phone: 12345 });
      const omitted = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), phone: undefined });

      expect(invalid.status).toBe(400);
      expect(invalid.body.errors.phone).toBeTruthy();
      expect(omitted.status).toBe(201);
      expect(omitted.body.data.phone).toBe('');
    });

    it('allows duplicate phone numbers and multiple Residents in one Unit', async () => {
      const first = await authRequest(app, authToken).post('/api/v1/residents').send(validPayload());
      const second = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), name: 'Priya Menon', type: 'tenant' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(await Resident.countDocuments({ unit: sampleUnit._id })).toBe(2);
    });

    it('rejects missing or invalid type and status', async () => {
      const missingType = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), type: undefined });
      const invalidType = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), type: 'guest' });
      const missingStatus = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), status: undefined });
      const invalidStatus = await authRequest(app, authToken)
        .post('/api/v1/residents')
        .send({ ...validPayload(), status: 'pending' });

      expect(missingType.status).toBe(400);
      expect(invalidType.status).toBe(400);
      expect(missingStatus.status).toBe(400);
      expect(invalidStatus.status).toBe(400);
    });
  });

  describe('GET /api/v1/residents', () => {
    it('returns an empty list when no Residents exist', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/residents');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns Residents with populated Unit and Building data', async () => {
      await Resident.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/residents');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit).toMatchObject({
        unitNumber: 'A-1101',
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
      });
    });

    it('searches by Resident name and phone only', async () => {
      await Resident.create([validPayload(), {
        name: 'Priya Menon',
        unit: secondaryUnit._id,
        phone: '+91 99887 76655',
        type: 'tenant',
        status: 'active',
      }]);

      const byName = await authRequest(app, authToken).get('/api/v1/residents?search=priya');
      const byPhone = await authRequest(app, authToken).get('/api/v1/residents?search=99887');

      expect(byName.body.data).toHaveLength(1);
      expect(byName.body.data[0].name).toBe('Priya Menon');
      expect(byPhone.body.data).toHaveLength(1);
      expect(byPhone.body.data[0].name).toBe('Priya Menon');
    });

    it('treats regex metacharacters in search as plain text', async () => {
      await Resident.create([validPayload(), {
        name: 'Priya (Menon)',
        unit: secondaryUnit._id,
        phone: '+91 99887 76655',
        type: 'tenant',
        status: 'active',
      }]);

      const specialName = await authRequest(app, authToken).get('/api/v1/residents?search=Priya%20(Menon)');
      const danglingBracket = await authRequest(app, authToken).get('/api/v1/residents?search=%5B');
      const literalDot = await authRequest(app, authToken).get('/api/v1/residents?search=98123.45670');

      expect(specialName.status).toBe(200);
      expect(specialName.body.data).toHaveLength(1);
      expect(specialName.body.data[0].name).toBe('Priya (Menon)');

      expect(danglingBracket.status).toBe(200);
      expect(danglingBracket.body.data).toHaveLength(0);

      expect(literalDot.status).toBe(200);
      expect(literalDot.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/v1/residents/:id', () => {
    it('returns one populated Resident', async () => {
      const created = await Resident.create(validPayload());
      const res = await authRequest(app, authToken).get(`/api/v1/residents/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Rahul Sharma');
      expect(res.body.data.unit.unitNumber).toBe('A-1101');
      expect(res.body.data.unit.building.code).toBe('BLD-A');
    });

    it('returns 404 for invalid and nonexistent Resident IDs', async () => {
      const invalid = await authRequest(app, authToken).get('/api/v1/residents/invalid-id');
      const nonexistent = await authRequest(app, authToken)
        .get(`/api/v1/residents/${new mongoose.Types.ObjectId()}`);

      expect(invalid.status).toBe(404);
      expect(invalid.body.message).toBe('Resident not found');
      expect(nonexistent.status).toBe(404);
      expect(nonexistent.body.message).toBe('Resident not found');
    });
  });

  describe('PATCH /api/v1/residents/:id', () => {
    it('updates name, phone, type, and status', async () => {
      const created = await Resident.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${created._id}`)
        .send({ name: ' Rahul Verma ', phone: ' 55555 ', type: 'tenant', status: 'inactive' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        name: 'Rahul Verma',
        phone: '55555',
        type: 'tenant',
        status: 'inactive',
      });
    });

    it('allows reassignment to another existing Unit', async () => {
      const created = await Resident.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${created._id}`)
        .send({ unit: secondaryUnit._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.unit.unitNumber).toBe('B-0901');
      expect(res.body.data.unit.building.code).toBe('BLD-B');
    });

    it('rejects invalid and nonexistent Unit reassignment', async () => {
      const created = await Resident.create(validPayload());
      const invalid = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${created._id}`)
        .send({ unit: 'invalid-id' });
      const nonexistent = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${created._id}`)
        .send({ unit: new mongoose.Types.ObjectId().toString() });

      expect(invalid.status).toBe(400);
      expect(nonexistent.status).toBe(400);
    });

    it('validates supplied update fields and returns 404 for a missing Resident', async () => {
      const created = await Resident.create(validPayload());
      const emptyName = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${created._id}`)
        .send({ name: ' ' });
      const invalidPhone = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${created._id}`)
        .send({ phone: 123 });
      const invalidType = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${created._id}`)
        .send({ type: 'guest' });
      const invalidStatus = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${created._id}`)
        .send({ status: 'pending' });
      const missing = await authRequest(app, authToken)
        .patch(`/api/v1/residents/${new mongoose.Types.ObjectId()}`)
        .send({ name: 'Missing' });

      expect(emptyName.status).toBe(400);
      expect(invalidPhone.status).toBe(400);
      expect(invalidType.status).toBe(400);
      expect(invalidStatus.status).toBe(400);
      expect(missing.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/residents/:id', () => {
    it('deletes only the Resident', async () => {
      const created = await Resident.create(validPayload());
      const res = await authRequest(app, authToken).delete(`/api/v1/residents/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Resident deleted successfully');
      expect(await Resident.findById(created._id)).toBeNull();
      expect(await Unit.findById(sampleUnit._id)).not.toBeNull();
      expect(await Building.findById(sampleBuilding._id)).not.toBeNull();
    });

    it('returns 404 for a nonexistent Resident', async () => {
      const res = await authRequest(app, authToken)
        .delete(`/api/v1/residents/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Resident not found');
    });
  });
});
