process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Parking = require('../src/models/Parking');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Parking API (/api/v1/parking)', () => {
  let authToken;
  let sampleBuilding;
  let secondaryBuilding;
  let sampleUnit;
  let secondaryUnit;

  const validPayload = () => ({
    slotCode: 'P-01',
    building: sampleBuilding._id.toString(),
    unit: sampleUnit._id.toString(),
    vehicleType: 'car',
    vehicleNumber: 'MH-12-AB-1234',
  });

  const minimalPayload = () => ({
    slotCode: 'P-01',
    building: sampleBuilding._id.toString(),
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
    await Parking.deleteMany({});
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

  describe('POST /api/v1/parking', () => {
    it('creates a parking slot with Building and Unit, populates both', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/parking').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Parking slot created successfully');
      expect(res.body.data).toMatchObject({
        slotCode: 'P-01',
        vehicleType: 'car',
        vehicleNumber: 'MH-12-AB-1234',
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
        unit: {
          unitNumber: 'A-1101',
          building: { name: 'Greenwood Heights', code: 'BLD-A' },
        },
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.building.id).toBeTruthy();
      expect(res.body.data.unit.id).toBeTruthy();
    });

    it('defaults vehicleType to car and vehicleNumber to empty when omitted', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/parking').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.slotCode).toBe('P-01');
      expect(res.body.data.vehicleType).toBe('car');
      expect(res.body.data.vehicleNumber).toBe('');
    });

    it('creates an unallocated slot when unit is omitted', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/parking').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.unit).toBeNull();
    });

    it('ignores vehicleNumber when unit is not provided', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...minimalPayload(), vehicleNumber: 'MH-12-AB-1234' });

      expect(res.status).toBe(201);
      expect(res.body.data.unit).toBeNull();
      expect(res.body.data.vehicleNumber).toBe('');
    });

    it('accepts explicit vehicleType bike', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...minimalPayload(), slotCode: 'M-01', vehicleType: 'bike' });

      expect(res.status).toBe(201);
      expect(res.body.data.vehicleType).toBe('bike');
    });

    it('rejects missing slotCode', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ building: sampleBuilding._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.errors.slotCode).toBeTruthy();
    });

    it('rejects empty slotCode', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...minimalPayload(), slotCode: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errors.slotCode).toBeTruthy();
    });

    it('rejects missing building', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ slotCode: 'P-01' });

      expect(res.status).toBe(400);
      expect(res.body.errors.building).toBeTruthy();
    });

    it('rejects invalid building ID format', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...minimalPayload(), building: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.building).toBeTruthy();
    });

    it('rejects nonexistent building reference', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...minimalPayload(), building: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/referenced building does not exist/i);
    });

    it('rejects duplicate slotCode within same building', async () => {
      await authRequest(app, authToken).post('/api/v1/parking').send(minimalPayload());
      const res = await authRequest(app, authToken).post('/api/v1/parking').send(minimalPayload());

      expect(res.status).toBe(409);
      expect(res.body.errors.slotCode).toBeTruthy();
    });

    it('allows same slotCode in different buildings', async () => {
      const first = await authRequest(app, authToken).post('/api/v1/parking').send(minimalPayload());
      const second = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...minimalPayload(), building: secondaryBuilding._id.toString() });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    it('rejects invalid unit ID format', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...validPayload(), unit: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
    });

    it('rejects nonexistent unit reference', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...validPayload(), unit: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/referenced unit does not exist/i);
    });

    it('rejects unit that belongs to a different building', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...validPayload(), unit: secondaryUnit._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unit does not belong to the selected building/i);
    });

    it('rejects invalid vehicleType', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...minimalPayload(), vehicleType: 'truck' });

      expect(res.status).toBe(400);
      expect(res.body.errors.vehicleType).toBeTruthy();
    });

    it('trims and uppercases slotCode', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/parking')
        .send({ ...minimalPayload(), slotCode: '  p-02  ' });

      expect(res.status).toBe(201);
      expect(res.body.data.slotCode).toBe('P-02');
    });
  });

  describe('GET /api/v1/parking', () => {
    it('returns an empty list when no slots exist', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/parking');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns slots with populated Building and Unit data', async () => {
      await Parking.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/parking');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].building).toMatchObject({
        name: 'Greenwood Heights',
        code: 'BLD-A',
      });
      expect(res.body.data[0].unit).toMatchObject({
        unitNumber: 'A-1101',
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
      });
    });

    it('returns null unit for unallocated slots', async () => {
      await Parking.create(minimalPayload());
      const res = await authRequest(app, authToken).get('/api/v1/parking');

      expect(res.status).toBe(200);
      expect(res.body.data[0].unit).toBeNull();
    });

    it('sorts by createdAt descending (newest first)', async () => {
      const first = await Parking.create({
        ...minimalPayload(),
        createdAt: new Date('2026-08-10T09:00:00Z'),
      });
      const second = await Parking.create({
        ...minimalPayload(),
        slotCode: 'P-02',
        createdAt: new Date('2026-08-12T09:00:00Z'),
      });

      const res = await authRequest(app, authToken).get('/api/v1/parking');

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].slotCode).toBe('P-02');
      expect(res.body.data[1].slotCode).toBe('P-01');
    });

    it('searches by slotCode', async () => {
      await Parking.create(validPayload());
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'M-05',
        vehicleType: 'bike',
      });

      const res = await authRequest(app, authToken).get('/api/v1/parking?search=P-01');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].slotCode).toBe('P-01');
    });

    it('searches by vehicleType', async () => {
      await Parking.create(validPayload());
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'M-05',
        vehicleType: 'bike',
      });

      const res = await authRequest(app, authToken).get('/api/v1/parking?search=bike');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].slotCode).toBe('M-05');
    });

    it('searches by unit number via Unit subquery', async () => {
      await Parking.create(validPayload());
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'P-02',
      });

      const res = await authRequest(app, authToken).get('/api/v1/parking?search=A-1101');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].slotCode).toBe('P-01');
    });

    it('combines search across slotCode, vehicleType, and unitNumber', async () => {
      await Parking.create(validPayload());
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'M-05',
        vehicleType: 'bike',
        unit: sampleUnit._id.toString(),
      });
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'P-02',
        unit: secondaryUnit._id.toString(),
      });

      const searchBike = await authRequest(app, authToken).get('/api/v1/parking?search=bike');
      expect(searchBike.body.data).toHaveLength(1);
      expect(searchBike.body.data[0].slotCode).toBe('M-05');

      const searchUnit = await authRequest(app, authToken).get('/api/v1/parking?search=B-0901');
      expect(searchUnit.body.data).toHaveLength(1);
      expect(searchUnit.body.data[0].slotCode).toBe('P-02');
    });

    it('treats regex metacharacters in search as plain text', async () => {
      await Parking.create(validPayload());
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'P.02',
      });

      const literalDot = await authRequest(app, authToken).get('/api/v1/parking?search=P.01');

      expect(literalDot.status).toBe(200);
      expect(literalDot.body.data).toHaveLength(0);
    });

    it('filters by building query param', async () => {
      await Parking.create(validPayload());
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'M-01',
        building: secondaryBuilding._id.toString(),
      });

      const res = await authRequest(app, authToken).get(
        `/api/v1/parking?building=${sampleBuilding._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].slotCode).toBe('P-01');
    });

    it('filters by unit query param', async () => {
      await Parking.create(validPayload());
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'P-02',
      });

      const res = await authRequest(app, authToken).get(
        `/api/v1/parking?unit=${sampleUnit._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit.unitNumber).toBe('A-1101');
    });

    it('combines search and building filter', async () => {
      await Parking.create(validPayload());
      await Parking.create({
        ...minimalPayload(),
        slotCode: 'P-01',
        building: secondaryBuilding._id.toString(),
      });

      const res = await authRequest(app, authToken).get(
        `/api/v1/parking?search=P-01&building=${sampleBuilding._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].building.code).toBe('BLD-A');
    });

    it('returns empty array for invalid building ID in filter', async () => {
      await Parking.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/parking?building=invalid-id');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid unit ID in filter', async () => {
      await Parking.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/parking?unit=invalid-id');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/parking/:id', () => {
    it('returns one populated parking slot', async () => {
      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken).get(`/api/v1/parking/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.slotCode).toBe('P-01');
      expect(res.body.data.building.code).toBe('BLD-A');
      expect(res.body.data.unit.unitNumber).toBe('A-1101');
      expect(res.body.data.unit.building.code).toBe('BLD-A');
    });

    it('returns 404 for invalid and nonexistent IDs', async () => {
      const invalid = await authRequest(app, authToken).get('/api/v1/parking/invalid-id');
      const nonexistent = await authRequest(app, authToken)
        .get(`/api/v1/parking/${new mongoose.Types.ObjectId()}`);

      expect(invalid.status).toBe(404);
      expect(invalid.body.message).toBe('Parking slot not found');
      expect(nonexistent.status).toBe(404);
      expect(nonexistent.body.message).toBe('Parking slot not found');
    });
  });

  describe('PATCH /api/v1/parking/:id', () => {
    it('updates slotCode, vehicleType, and vehicleNumber', async () => {
      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${created._id}`)
        .send({ slotCode: 'P-10', vehicleType: 'bike', vehicleNumber: 'MH-12-XY-9999' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        slotCode: 'P-10',
        vehicleType: 'bike',
        vehicleNumber: 'MH-12-XY-9999',
      });
    });

    it('reassigns to another unit within the same building', async () => {
      const anotherUnit = await Unit.create({
        unitNumber: 'A-1201',
        building: sampleBuilding._id,
      });

      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${created._id}`)
        .send({ unit: anotherUnit._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.unit.unitNumber).toBe('A-1201');
    });

    it('unallocates by setting unit to null and clears vehicleNumber', async () => {
      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${created._id}`)
        .send({ unit: null });

      expect(res.status).toBe(200);
      expect(res.body.data.unit).toBeNull();
      expect(res.body.data.vehicleNumber).toBe('');
    });

    it('rejects empty slotCode on update', async () => {
      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${created._id}`)
        .send({ slotCode: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errors.slotCode).toBeTruthy();
    });

    it('rejects invalid unit on update', async () => {
      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${created._id}`)
        .send({ unit: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
    });

    it('rejects unit belonging to a different building on update', async () => {
      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${created._id}`)
        .send({ unit: secondaryUnit._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unit does not belong to the selected building/i);
    });

    it('rejects duplicate slotCode within same building on update', async () => {
      await Parking.create(validPayload());
      const second = await Parking.create({
        ...minimalPayload(),
        slotCode: 'P-02',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${second._id}`)
        .send({ slotCode: 'P-01' });

      expect(res.status).toBe(409);
      expect(res.body.errors.slotCode).toBeTruthy();
    });

    it('allows same slotCode when it belongs to the same slot on update', async () => {
      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${created._id}`)
        .send({ slotCode: 'P-01', vehicleNumber: 'MH-12-NEW-0000' });

      expect(res.status).toBe(200);
      expect(res.body.data.slotCode).toBe('P-01');
      expect(res.body.data.vehicleNumber).toBe('MH-12-NEW-0000');
    });

    it('returns 404 for nonexistent slot', async () => {
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/parking/${new mongoose.Types.ObjectId()}`)
        .send({ slotCode: 'P-99' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Parking slot not found');
    });
  });

  describe('DELETE /api/v1/parking/:id', () => {
    it('deletes only the parking slot', async () => {
      const created = await Parking.create(validPayload());
      const res = await authRequest(app, authToken).delete(`/api/v1/parking/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Parking slot deleted successfully');
      expect(await Parking.findById(created._id)).toBeNull();
      expect(await Unit.findById(sampleUnit._id)).not.toBeNull();
      expect(await Building.findById(sampleBuilding._id)).not.toBeNull();
    });

    it('returns 404 for a nonexistent slot', async () => {
      const res = await authRequest(app, authToken)
        .delete(`/api/v1/parking/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Parking slot not found');
    });
  });
});
