process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Maintenance = require('../src/models/Maintenance');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');

describe('Maintenance API (/api/v1/maintenance)', () => {
  let sampleBuilding;
  let secondaryBuilding;
  let sampleUnit;
  let secondaryUnit;

  const validPayload = () => ({
    title: 'AC not cooling',
    unit: sampleUnit._id.toString(),
    description: 'The AC in the living room is not cooling properly.',
    priority: 'high',
    assignedTo: 'Ramesh Kumar',
    status: 'open',
  });

  beforeAll(async () => {
    await startMemoryDb();
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await Maintenance.deleteMany({});
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

  describe('POST /api/v1/maintenance', () => {
    it('creates a Maintenance request with populated Unit and Building data', async () => {
      const res = await request(app).post('/api/v1/maintenance').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Maintenance request created successfully');
      expect(res.body.data).toMatchObject({
        title: 'AC not cooling',
        description: 'The AC in the living room is not cooling properly.',
        priority: 'high',
        assignedTo: 'Ramesh Kumar',
        status: 'open',
        unit: {
          unitNumber: 'A-1101',
          building: { name: 'Greenwood Heights', code: 'BLD-A' },
        },
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.unit.id).toBeTruthy();
      expect(res.body.data.unit.building.id).toBeTruthy();
    });

    it('rejects missing and empty titles', async () => {
      const missing = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), title: undefined });
      const empty = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), title: '   ' });

      expect(missing.status).toBe(400);
      expect(missing.body.errors.title).toBeTruthy();
      expect(empty.status).toBe(400);
      expect(empty.body.errors.title).toBeTruthy();
    });

    it('rejects missing Unit', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), unit: undefined });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
    });

    it('rejects invalid Unit ID and nonexistent Unit', async () => {
      const invalid = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), unit: 'invalid-id' });
      const nonexistent = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), unit: new mongoose.Types.ObjectId().toString() });

      expect(invalid.status).toBe(400);
      expect(nonexistent.status).toBe(400);
      expect(nonexistent.body.message).toMatch(/referenced unit does not exist/i);
    });

    it('rejects invalid priority', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), priority: 'critical' });

      expect(res.status).toBe(400);
      expect(res.body.errors.priority).toBeTruthy();
    });

    it('rejects invalid status', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), status: 'cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('accepts optional description and assignedTo', async () => {
      const omitted = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), description: undefined, assignedTo: undefined });

      expect(omitted.status).toBe(201);
      expect(omitted.body.data.description).toBe('');
      expect(omitted.body.data.assignedTo).toBe('');
    });

    it('rejects non-string description and assignedTo', async () => {
      const badDesc = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), description: 12345 });
      const badAssign = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), assignedTo: 12345 });

      expect(badDesc.status).toBe(400);
      expect(badDesc.body.errors.description).toBeTruthy();
      expect(badAssign.status).toBe(400);
      expect(badAssign.body.errors.assignedTo).toBeTruthy();
    });

    it('allows multiple Maintenance requests for the same Unit', async () => {
      const first = await request(app).post('/api/v1/maintenance').send(validPayload());
      const second = await request(app)
        .post('/api/v1/maintenance')
        .send({ ...validPayload(), title: 'Water heater repair', priority: 'medium' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(await Maintenance.countDocuments({ unit: sampleUnit._id })).toBe(2);
    });
  });

  describe('GET /api/v1/maintenance', () => {
    it('returns an empty list when no requests exist', async () => {
      const res = await request(app).get('/api/v1/maintenance');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns Maintenance requests with populated Unit and Building data', async () => {
      await Maintenance.create(validPayload());
      const res = await request(app).get('/api/v1/maintenance');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit).toMatchObject({
        unitNumber: 'A-1101',
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
      });
    });

    it('searches by title only', async () => {
      await Maintenance.create([validPayload(), {
        title: 'Water heater repair',
        unit: secondaryUnit._id,
        priority: 'medium',
        status: 'open',
      }]);

      const byTitle = await request(app).get('/api/v1/maintenance?search=water');

      expect(byTitle.body.data).toHaveLength(1);
      expect(byTitle.body.data[0].title).toBe('Water heater repair');
    });

    it('treats regex metacharacters in search as plain text', async () => {
      await Maintenance.create([validPayload(), {
        title: 'Fix AC (model X)',
        unit: secondaryUnit._id,
        priority: 'medium',
        status: 'open',
      }]);

      const specialTitle = await request(app).get('/api/v1/maintenance?search=AC%20(model%20X)');
      const danglingBracket = await request(app).get('/api/v1/maintenance?search=%5B');
      const literalDot = await request(app).get('/api/v1/maintenance?search=AC.not');

      expect(specialTitle.status).toBe(200);
      expect(specialTitle.body.data).toHaveLength(1);
      expect(specialTitle.body.data[0].title).toBe('Fix AC (model X)');

      expect(danglingBracket.status).toBe(200);
      expect(danglingBracket.body.data).toHaveLength(0);

      expect(literalDot.status).toBe(200);
      expect(literalDot.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/v1/maintenance/:id', () => {
    it('returns one populated Maintenance request', async () => {
      const created = await Maintenance.create(validPayload());
      const res = await request(app).get(`/api/v1/maintenance/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('AC not cooling');
      expect(res.body.data.unit.unitNumber).toBe('A-1101');
      expect(res.body.data.unit.building.code).toBe('BLD-A');
    });

    it('returns 404 for invalid and nonexistent Maintenance IDs', async () => {
      const invalid = await request(app).get('/api/v1/maintenance/invalid-id');
      const nonexistent = await request(app)
        .get(`/api/v1/maintenance/${new mongoose.Types.ObjectId()}`);

      expect(invalid.status).toBe(404);
      expect(invalid.body.message).toBe('Maintenance request not found');
      expect(nonexistent.status).toBe(404);
      expect(nonexistent.body.message).toBe('Maintenance request not found');
    });
  });

  describe('PATCH /api/v1/maintenance/:id', () => {
    it('updates title, description, priority, assignedTo, and status', async () => {
      const created = await Maintenance.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ title: ' AC not cooling (resolved) ', description: ' Fixed. ', priority: 'low', assignedTo: ' Joseph Mathew ', status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        title: 'AC not cooling (resolved)',
        description: 'Fixed.',
        priority: 'low',
        assignedTo: 'Joseph Mathew',
        status: 'completed',
      });
    });

    it('allows reassignment to another existing Unit', async () => {
      const created = await Maintenance.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ unit: secondaryUnit._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.unit.unitNumber).toBe('B-0901');
      expect(res.body.data.unit.building.code).toBe('BLD-B');
    });

    it('rejects invalid and nonexistent Unit reassignment', async () => {
      const created = await Maintenance.create(validPayload());
      const invalid = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ unit: 'invalid-id' });
      const nonexistent = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ unit: new mongoose.Types.ObjectId().toString() });

      expect(invalid.status).toBe(400);
      expect(nonexistent.status).toBe(400);
    });

    it('validates supplied update fields and returns 404 for a missing request', async () => {
      const created = await Maintenance.create(validPayload());
      const emptyTitle = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ title: ' ' });
      const invalidPriority = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ priority: 'critical' });
      const invalidStatus = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ status: 'cancelled' });
      const invalidDesc = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ description: 123 });
      const invalidAssigned = await request(app)
        .patch(`/api/v1/maintenance/${created._id}`)
        .send({ assignedTo: 123 });
      const missing = await request(app)
        .patch(`/api/v1/maintenance/${new mongoose.Types.ObjectId()}`)
        .send({ title: 'Missing' });

      expect(emptyTitle.status).toBe(400);
      expect(invalidPriority.status).toBe(400);
      expect(invalidStatus.status).toBe(400);
      expect(invalidDesc.status).toBe(400);
      expect(invalidAssigned.status).toBe(400);
      expect(missing.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/maintenance/:id', () => {
    it('deletes only the Maintenance request', async () => {
      const created = await Maintenance.create(validPayload());
      const res = await request(app).delete(`/api/v1/maintenance/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Maintenance request deleted successfully');
      expect(await Maintenance.findById(created._id)).toBeNull();
      expect(await Unit.findById(sampleUnit._id)).not.toBeNull();
      expect(await Building.findById(sampleBuilding._id)).not.toBeNull();
    });

    it('returns 404 for a nonexistent Maintenance request', async () => {
      const res = await request(app)
        .delete(`/api/v1/maintenance/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Maintenance request not found');
    });
  });
});
