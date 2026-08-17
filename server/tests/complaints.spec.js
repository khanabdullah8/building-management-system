process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Complaint = require('../src/models/Complaint');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');

describe('Complaints API (/api/v1/complaints)', () => {
  let sampleBuilding;
  let secondaryBuilding;
  let sampleUnit;
  let secondaryUnit;

  const validUnitPayload = () => ({
    subject: 'Water leakage in kitchen',
    unit: sampleUnit._id.toString(),
    description: 'Leakage from the ceiling above the sink.',
    priority: 'high',
    status: 'open',
  });

  const validLocationPayload = () => ({
    subject: 'Stray dog near gate 2',
    location: 'Main gate entrance',
    description: 'Large stray dog spotted near the security booth.',
    priority: 'low',
    status: 'open',
  });

  beforeAll(async () => {
    await startMemoryDb();
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await Complaint.deleteMany({});
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

  describe('POST /api/v1/complaints', () => {
    it('creates a Complaint with a Unit and populates Unit and Building data', async () => {
      const res = await request(app).post('/api/v1/complaints').send(validUnitPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Complaint created successfully');
      expect(res.body.data).toMatchObject({
        subject: 'Water leakage in kitchen',
        description: 'Leakage from the ceiling above the sink.',
        priority: 'high',
        status: 'open',
        location: '',
        unit: {
          unitNumber: 'A-1101',
          building: { name: 'Greenwood Heights', code: 'BLD-A' },
        },
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.unit.id).toBeTruthy();
      expect(res.body.data.unit.building.id).toBeTruthy();
    });

    it('creates a common-area Complaint with location and unit null', async () => {
      const res = await request(app).post('/api/v1/complaints').send(validLocationPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        subject: 'Stray dog near gate 2',
        location: 'Main gate entrance',
        description: 'Large stray dog spotted near the security booth.',
        priority: 'low',
        status: 'open',
        unit: null,
      });
      expect(res.body.data.id).toBeTruthy();
    });

    it('rejects missing and empty subjects', async () => {
      const missing = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), subject: undefined });
      const empty = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), subject: '   ' });

      expect(missing.status).toBe(400);
      expect(missing.body.errors.subject).toBeTruthy();
      expect(empty.status).toBe(400);
      expect(empty.body.errors.subject).toBeTruthy();
    });

    it('rejects missing unit and location', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .send({
          subject: 'Broken window',
          priority: 'medium',
          status: 'open',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
      expect(res.body.errors.location).toBeTruthy();
    });

    it('rejects invalid Unit ID and nonexistent Unit', async () => {
      const invalid = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), unit: 'invalid-id' });
      const nonexistent = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), unit: new mongoose.Types.ObjectId().toString() });

      expect(invalid.status).toBe(400);
      expect(nonexistent.status).toBe(400);
      expect(nonexistent.body.message).toMatch(/referenced unit does not exist/i);
    });

    it('rejects invalid priority', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), priority: 'critical' });

      expect(res.status).toBe(400);
      expect(res.body.errors.priority).toBeTruthy();
    });

    it('rejects invalid status', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), status: 'cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('accepts omitted description (defaults to empty string)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), description: undefined });

      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('');
    });

    it('rejects non-string description', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), description: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.errors.description).toBeTruthy();
    });

    it('allows multiple Complaints for the same Unit', async () => {
      const first = await request(app).post('/api/v1/complaints').send(validUnitPayload());
      const second = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), subject: 'Lift noise', priority: 'medium' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(await Complaint.countDocuments({ unit: sampleUnit._id })).toBe(2);
    });

    it('allows multiple common-area Complaints for the same location', async () => {
      const first = await request(app).post('/api/v1/complaints').send(validLocationPayload());
      const second = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validLocationPayload(), subject: 'Broken light in lobby' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    it('rejects non-string location when unit is not provided', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .send({ subject: 'Lobby issue', location: 123, priority: 'low', status: 'open' });

      expect(res.status).toBe(400);
      expect(res.body.errors.location).toBeTruthy();
    });

    it('rejects non-string location even when valid unit is provided', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .send({ ...validUnitPayload(), location: 123 });

      expect(res.status).toBe(400);
      expect(res.body.errors.location).toBeTruthy();
    });

    it('rejects empty location when unit is not provided', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .send({ subject: 'Lobby issue', location: '   ', priority: 'low', status: 'open' });

      expect(res.status).toBe(400);
      expect(res.body.errors.location).toBeTruthy();
    });
  });

  describe('GET /api/v1/complaints', () => {
    it('returns an empty list when no complaints exist', async () => {
      const res = await request(app).get('/api/v1/complaints');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns Complaints with populated Unit and Building data', async () => {
      await Complaint.create(validUnitPayload());
      const res = await request(app).get('/api/v1/complaints');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit).toMatchObject({
        unitNumber: 'A-1101',
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
      });
    });

    it('returns common-area Complaints with unit null and location preserved', async () => {
      await Complaint.create(validLocationPayload());
      const res = await request(app).get('/api/v1/complaints');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit).toBeNull();
      expect(res.body.data[0].location).toBe('Main gate entrance');
    });

    it('searches by subject only', async () => {
      await Complaint.create([validUnitPayload(), {
        subject: 'Lift noise on floor 9',
        unit: secondaryUnit._id,
        priority: 'medium',
        status: 'in-progress',
      }]);

      const bySubject = await request(app).get('/api/v1/complaints?search=lift');

      expect(bySubject.body.data).toHaveLength(1);
      expect(bySubject.body.data[0].subject).toBe('Lift noise on floor 9');
    });

    it('treats regex metacharacters in search as plain text', async () => {
      await Complaint.create([validUnitPayload(), {
        subject: 'Fix AC (model X)',
        unit: secondaryUnit._id,
        priority: 'medium',
        status: 'open',
      }]);

      const specialSubject = await request(app).get('/api/v1/complaints?search=AC%20(model%20X)');
      const danglingBracket = await request(app).get('/api/v1/complaints?search=%5B');
      const literalDot = await request(app).get('/api/v1/complaints?search=AC.not');

      expect(specialSubject.status).toBe(200);
      expect(specialSubject.body.data).toHaveLength(1);
      expect(specialSubject.body.data[0].subject).toBe('Fix AC (model X)');

      expect(danglingBracket.status).toBe(200);
      expect(danglingBracket.body.data).toHaveLength(0);

      expect(literalDot.status).toBe(200);
      expect(literalDot.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/v1/complaints/:id', () => {
    it('returns one populated Complaint', async () => {
      const created = await Complaint.create(validUnitPayload());
      const res = await request(app).get(`/api/v1/complaints/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.subject).toBe('Water leakage in kitchen');
      expect(res.body.data.unit.unitNumber).toBe('A-1101');
      expect(res.body.data.unit.building.code).toBe('BLD-A');
    });

    it('returns one common-area Complaint with unit null', async () => {
      const created = await Complaint.create(validLocationPayload());
      const res = await request(app).get(`/api/v1/complaints/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.subject).toBe('Stray dog near gate 2');
      expect(res.body.data.unit).toBeNull();
      expect(res.body.data.location).toBe('Main gate entrance');
    });

    it('returns 404 for invalid and nonexistent Complaint IDs', async () => {
      const invalid = await request(app).get('/api/v1/complaints/invalid-id');
      const nonexistent = await request(app)
        .get(`/api/v1/complaints/${new mongoose.Types.ObjectId()}`);

      expect(invalid.status).toBe(404);
      expect(invalid.body.message).toBe('Complaint not found');
      expect(nonexistent.status).toBe(404);
      expect(nonexistent.body.message).toBe('Complaint not found');
    });
  });

  describe('PATCH /api/v1/complaints/:id', () => {
    it('updates subject, description, priority, and status', async () => {
      const created = await Complaint.create(validUnitPayload());
      const res = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ subject: ' Water leakage (resolved) ', description: ' Fixed. ', priority: 'low', status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        subject: 'Water leakage (resolved)',
        description: 'Fixed.',
        priority: 'low',
        status: 'resolved',
      });
    });

    it('allows reassignment to another existing Unit', async () => {
      const created = await Complaint.create(validUnitPayload());
      const res = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ unit: secondaryUnit._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.unit.unitNumber).toBe('B-0901');
      expect(res.body.data.unit.building.code).toBe('BLD-B');
    });

    it('allows switching from Unit to common-area (unit null + location)', async () => {
      const created = await Complaint.create(validUnitPayload());
      const res = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ unit: null, location: 'Rooftop terrace' });

      expect(res.status).toBe(200);
      expect(res.body.data.unit).toBeNull();
      expect(res.body.data.location).toBe('Rooftop terrace');
    });

    it('allows switching from common-area to Unit', async () => {
      const created = await Complaint.create(validLocationPayload());
      const res = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ unit: sampleUnit._id.toString(), location: '' });

      expect(res.status).toBe(200);
      expect(res.body.data.unit.unitNumber).toBe('A-1101');
      expect(res.body.data.unit.building.code).toBe('BLD-A');
      expect(res.body.data.location).toBe('');
    });

    it('rejects invalid and nonexistent Unit reassignment', async () => {
      const created = await Complaint.create(validUnitPayload());
      const invalid = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ unit: 'invalid-id' });
      const nonexistent = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ unit: new mongoose.Types.ObjectId().toString() });

      expect(invalid.status).toBe(400);
      expect(nonexistent.status).toBe(400);
    });

    it('rejects setting unit null without location when existing location is empty', async () => {
      const created = await Complaint.create(validUnitPayload());
      const res = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ unit: null });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
      expect(res.body.errors.location).toBeTruthy();
    });

    it('rejects non-string location on PATCH with valid unit', async () => {
      const created = await Complaint.create(validUnitPayload());
      const res = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ location: 123 });

      expect(res.status).toBe(400);
      expect(res.body.errors.location).toBeTruthy();
    });

    it('rejects non-string location on PATCH for common-area complaint', async () => {
      const created = await Complaint.create(validLocationPayload());
      const res = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ location: 123 });

      expect(res.status).toBe(400);
      expect(res.body.errors.location).toBeTruthy();
    });

    it('validates supplied update fields and returns 404 for a missing complaint', async () => {
      const created = await Complaint.create(validUnitPayload());
      const emptySubject = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ subject: ' ' });
      const invalidPriority = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ priority: 'critical' });
      const invalidStatus = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ status: 'cancelled' });
      const invalidDesc = await request(app)
        .patch(`/api/v1/complaints/${created._id}`)
        .send({ description: 123 });
      const missing = await request(app)
        .patch(`/api/v1/complaints/${new mongoose.Types.ObjectId()}`)
        .send({ subject: 'Missing' });

      expect(emptySubject.status).toBe(400);
      expect(invalidPriority.status).toBe(400);
      expect(invalidStatus.status).toBe(400);
      expect(invalidDesc.status).toBe(400);
      expect(missing.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/complaints/:id', () => {
    it('deletes only the Complaint', async () => {
      const created = await Complaint.create(validUnitPayload());
      const res = await request(app).delete(`/api/v1/complaints/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Complaint deleted successfully');
      expect(await Complaint.findById(created._id)).toBeNull();
      expect(await Unit.findById(sampleUnit._id)).not.toBeNull();
      expect(await Building.findById(sampleBuilding._id)).not.toBeNull();
    });

    it('returns 404 for a nonexistent Complaint', async () => {
      const res = await request(app)
        .delete(`/api/v1/complaints/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Complaint not found');
    });
  });
});
