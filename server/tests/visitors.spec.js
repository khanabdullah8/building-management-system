process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Visitor = require('../src/models/Visitor');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Visitors API (/api/v1/visitors)', () => {
  let authToken;
  let sampleBuilding;
  let secondaryBuilding;
  let sampleUnit;
  let secondaryUnit;

  const validPayload = () => ({
    name: 'Vikram Singh',
    unit: sampleUnit._id.toString(),
    phone: '+91 98111 22334',
    purpose: 'Guest',
  });

  const minimalPayload = () => ({
    name: 'Delivery Person',
    unit: sampleUnit._id.toString(),
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
    await Visitor.deleteMany({});
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

  describe('POST /api/v1/visitors', () => {
    it('creates a Visitor with a Unit and populates Unit and Building data', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/visitors').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Visitor registered successfully');
      expect(res.body.data).toMatchObject({
        name: 'Vikram Singh',
        phone: '+91 98111 22334',
        purpose: 'Guest',
        checkOutAt: null,
        unit: {
          unitNumber: 'A-1101',
          building: { name: 'Greenwood Heights', code: 'BLD-A' },
        },
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.unit.id).toBeTruthy();
      expect(res.body.data.unit.building.id).toBeTruthy();
    });

    it('defaults phone and purpose to empty strings when omitted', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/visitors').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Delivery Person');
      expect(res.body.data.phone).toBe('');
      expect(res.body.data.purpose).toBe('');
      expect(res.body.data.checkOutAt).toBeNull();
    });

    it('defaults checkInAt to server time when omitted', async () => {
      const before = Date.now();
      const res = await authRequest(app, authToken).post('/api/v1/visitors').send(minimalPayload());
      const after = Date.now();

      expect(res.status).toBe(201);
      const checkInAt = new Date(res.body.data.checkInAt).getTime();
      expect(checkInAt).toBeGreaterThanOrEqual(before);
      expect(checkInAt).toBeLessThanOrEqual(after);
    });

    it('accepts explicit checkInAt', async () => {
      const date = new Date('2026-08-15T10:00:00.000Z');
      const res = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), checkInAt: date.toISOString() });

      expect(res.status).toBe(201);
      expect(new Date(res.body.data.checkInAt).toISOString()).toBe(date.toISOString());
    });

    it('rejects missing and empty name', async () => {
      const missing = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), name: undefined });
      const empty = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), name: '   ' });

      expect(missing.status).toBe(400);
      expect(missing.body.errors.name).toBeTruthy();
      expect(empty.status).toBe(400);
      expect(empty.body.errors.name).toBeTruthy();
    });

    it('rejects missing unit', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ name: 'Guest' });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
    });

    it('rejects invalid Unit ID format', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), unit: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
    });

    it('rejects nonexistent Unit reference', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), unit: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/referenced unit does not exist/i);
    });

    it('allows multiple Visitors for the same Unit', async () => {
      const first = await authRequest(app, authToken).post('/api/v1/visitors').send(validPayload());
      const second = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), name: 'Meera Pillai' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(await Visitor.countDocuments({ unit: sampleUnit._id })).toBe(2);
    });

    it('rejects non-string phone', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), phone: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.errors.phone).toBeTruthy();
    });

    it('rejects non-string purpose', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), purpose: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.errors.purpose).toBeTruthy();
    });

    it('rejects invalid checkInAt', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ ...validPayload(), checkInAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.checkInAt).toBeTruthy();
    });

    it('trims whitespace from name, phone, and purpose', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/visitors')
        .send({ name: ' Vikram Singh ', phone: ' +91 98111 22334 ', purpose: ' Guest ', unit: sampleUnit._id.toString() });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Vikram Singh');
      expect(res.body.data.phone).toBe('+91 98111 22334');
      expect(res.body.data.purpose).toBe('Guest');
    });
  });

  describe('GET /api/v1/visitors', () => {
    it('returns an empty list when no visitors exist', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/visitors');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns Visitors with populated Unit and Building data', async () => {
      await Visitor.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/visitors');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit).toMatchObject({
        unitNumber: 'A-1101',
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
      });
    });

    it('sorts by checkInAt descending (newest first)', async () => {
      const first = await Visitor.create({
        name: 'First Visitor',
        unit: sampleUnit._id,
        checkInAt: new Date('2026-08-10T09:00:00Z'),
      });
      const second = await Visitor.create({
        name: 'Second Visitor',
        unit: sampleUnit._id,
        checkInAt: new Date('2026-08-12T09:00:00Z'),
      });

      const res = await authRequest(app, authToken).get('/api/v1/visitors');

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Second Visitor');
      expect(res.body.data[1].name).toBe('First Visitor');
    });

    it('searches by name', async () => {
      await Visitor.create([
        validPayload(),
        { name: 'Meera Pillai', unit: secondaryUnit._id, phone: '+91 98111 22335', purpose: 'Courier' },
      ]);

      const res = await authRequest(app, authToken).get('/api/v1/visitors?search=vikram');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Vikram Singh');
    });

    it('searches by phone', async () => {
      await Visitor.create([
        validPayload(),
        { name: 'Meera Pillai', unit: secondaryUnit._id, phone: '+91 98111 22335', purpose: 'Courier' },
      ]);

      const res = await authRequest(app, authToken).get('/api/v1/visitors?search=22335');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Meera Pillai');
    });

    it('searches by purpose', async () => {
      await Visitor.create([
        validPayload(),
        { name: 'Meera Pillai', unit: secondaryUnit._id, phone: '+91 98111 22335', purpose: 'Courier' },
      ]);

      const res = await authRequest(app, authToken).get('/api/v1/visitors?search=courier');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].purpose).toBe('Courier');
    });

    it('treats regex metacharacters in search as plain text', async () => {
      await Visitor.create([
        validPayload(),
        { name: 'AC Repair (Unit X)', unit: secondaryUnit._id, purpose: 'Maintenance' },
      ]);

      const specialName = await authRequest(app, authToken).get('/api/v1/visitors?search=AC%20Repair%20(Unit%20X)');
      const danglingBracket = await authRequest(app, authToken).get('/api/v1/visitors?search=%5B');
      const literalDot = await authRequest(app, authToken).get('/api/v1/visitors?search=AC.Repair');

      expect(specialName.status).toBe(200);
      expect(specialName.body.data).toHaveLength(1);
      expect(specialName.body.data[0].name).toBe('AC Repair (Unit X)');

      expect(danglingBracket.status).toBe(200);
      expect(danglingBracket.body.data).toHaveLength(0);

      expect(literalDot.status).toBe(200);
      expect(literalDot.body.data).toHaveLength(0);
    });

    it('filters by unit query param', async () => {
      await Visitor.create([
        validPayload(),
        { name: 'Meera Pillai', unit: secondaryUnit._id, purpose: 'Courier' },
      ]);

      const res = await authRequest(app, authToken).get(`/api/v1/visitors?unit=${sampleUnit._id}`);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit.unitNumber).toBe('A-1101');
    });

    it('combines search and unit filter', async () => {
      await Visitor.create([
        validPayload(),
        { name: 'Vikram Singh', unit: secondaryUnit._id, purpose: 'Service' },
      ]);

      const res = await authRequest(app, authToken).get(
        `/api/v1/visitors?search=vikram&unit=${sampleUnit._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit.unitNumber).toBe('A-1101');
    });

    it('returns empty array for invalid unit ID in filter', async () => {
      await Visitor.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/visitors?unit=invalid-id');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/visitors/:id', () => {
    it('returns one populated Visitor', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken).get(`/api/v1/visitors/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Vikram Singh');
      expect(res.body.data.unit.unitNumber).toBe('A-1101');
      expect(res.body.data.unit.building.code).toBe('BLD-A');
    });

    it('returns 404 for invalid and nonexistent Visitor IDs', async () => {
      const invalid = await authRequest(app, authToken).get('/api/v1/visitors/invalid-id');
      const nonexistent = await authRequest(app, authToken)
        .get(`/api/v1/visitors/${new mongoose.Types.ObjectId()}`);

      expect(invalid.status).toBe(404);
      expect(invalid.body.message).toBe('Visitor not found');
      expect(nonexistent.status).toBe(404);
      expect(nonexistent.body.message).toBe('Visitor not found');
    });
  });

  describe('PATCH /api/v1/visitors/:id', () => {
    it('updates name, phone, and purpose', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ name: ' Vikram Singh (updated) ', phone: '+91 99999 00000', purpose: 'Maintenance' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        name: 'Vikram Singh (updated)',
        phone: '+91 99999 00000',
        purpose: 'Maintenance',
      });
    });

    it('allows reassignment to another existing Unit', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ unit: secondaryUnit._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.unit.unitNumber).toBe('B-0901');
      expect(res.body.data.unit.building.code).toBe('BLD-B');
    });

    it('sets checkOutAt to checkout a visitor', async () => {
      const created = await Visitor.create(validPayload());
      const checkoutDate = new Date('2026-08-18T14:30:00Z');
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ checkOutAt: checkoutDate.toISOString() });

      expect(res.status).toBe(200);
      expect(new Date(res.body.data.checkOutAt).toISOString()).toBe(checkoutDate.toISOString());
    });

    it('clears checkOutAt by setting to null', async () => {
      const created = await Visitor.create({
        ...validPayload(),
        checkOutAt: new Date(),
      });
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ checkOutAt: null });

      expect(res.status).toBe(200);
      expect(res.body.data.checkOutAt).toBeNull();
    });

    it('updates checkInAt', async () => {
      const created = await Visitor.create(validPayload());
      const newDate = new Date('2026-08-20T08:00:00Z');
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ checkInAt: newDate.toISOString() });

      expect(res.status).toBe(200);
      expect(new Date(res.body.data.checkInAt).toISOString()).toBe(newDate.toISOString());
    });

    it('rejects empty name', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ name: ' ' });

      expect(res.status).toBe(400);
      expect(res.body.errors.name).toBeTruthy();
    });

    it('rejects invalid Unit on update', async () => {
      const created = await Visitor.create(validPayload());
      const invalid = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ unit: 'invalid-id' });
      const nonexistent = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ unit: new mongoose.Types.ObjectId().toString() });

      expect(invalid.status).toBe(400);
      expect(nonexistent.status).toBe(400);
    });

    it('rejects non-string phone on update', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ phone: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.errors.phone).toBeTruthy();
    });

    it('rejects non-string purpose on update', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ purpose: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.errors.purpose).toBeTruthy();
    });

    it('rejects invalid checkInAt on update', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ checkInAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.checkInAt).toBeTruthy();
    });

    it('rejects invalid checkOutAt on update', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${created._id}`)
        .send({ checkOutAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.checkOutAt).toBeTruthy();
    });

    it('returns 404 for nonexistent Visitor', async () => {
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/visitors/${new mongoose.Types.ObjectId()}`)
        .send({ name: 'Missing' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Visitor not found');
    });
  });

  describe('DELETE /api/v1/visitors/:id', () => {
    it('deletes only the Visitor', async () => {
      const created = await Visitor.create(validPayload());
      const res = await authRequest(app, authToken).delete(`/api/v1/visitors/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Visitor deleted successfully');
      expect(await Visitor.findById(created._id)).toBeNull();
      expect(await Unit.findById(sampleUnit._id)).not.toBeNull();
      expect(await Building.findById(sampleBuilding._id)).not.toBeNull();
    });

    it('returns 404 for a nonexistent Visitor', async () => {
      const res = await authRequest(app, authToken)
        .delete(`/api/v1/visitors/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Visitor not found');
    });
  });
});
