process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Notice = require('../src/models/Notice');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Notices API (/api/v1/notices)', () => {
  let authToken;
  let sampleBuilding;
  let secondaryBuilding;

  const validAllResidentsPayload = () => ({
    title: 'Quarterly maintenance due',
    category: 'notice',
    description: 'Please pay maintenance charges by end of month.',
  });

  const validBuildingPayload = () => ({
    title: 'Power shutdown on Sunday',
    category: 'announcement',
    description: 'Scheduled power cut from 10 AM to 4 PM.',
    building: sampleBuilding._id.toString(),
    expiresAt: new Date('2026-08-12').toISOString(),
  });

  const validEventPayload = () => ({
    title: 'Annual sports day',
    category: 'event',
    building: null,
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
    await Notice.deleteMany({});
    await Building.deleteMany({});

    sampleBuilding = await Building.create({
      code: 'BLD-A',
      name: 'Greenwood Heights',
    });
    secondaryBuilding = await Building.create({
      code: 'BLD-B',
      name: 'Maple Residency',
    });
  });

  describe('POST /api/v1/notices', () => {
    it('creates a Notice with building ref and populates building data', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/notices').send(validBuildingPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Notice created successfully');
      expect(res.body.data).toMatchObject({
        title: 'Power shutdown on Sunday',
        category: 'announcement',
        description: 'Scheduled power cut from 10 AM to 4 PM.',
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.building.id).toBeTruthy();
      expect(res.body.data.publishedAt).toBeTruthy();
      expect(new Date(res.body.data.expiresAt).toISOString()).toBe(new Date('2026-08-12').toISOString());
    });

    it('creates a Notice with building null (All residents)', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/notices').send(validAllResidentsPayload());

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        title: 'Quarterly maintenance due',
        category: 'notice',
        description: 'Please pay maintenance charges by end of month.',
        building: null,
        expiresAt: null,
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.publishedAt).toBeTruthy();
    });

    it('creates an event Notice', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/notices').send(validEventPayload());

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        title: 'Annual sports day',
        category: 'event',
        building: null,
      });
    });

    it('rejects missing and empty title', async () => {
      const missing = await authRequest(app, authToken)
        .post('/api/v1/notices')
        .send({ ...validAllResidentsPayload(), title: undefined });
      const empty = await authRequest(app, authToken)
        .post('/api/v1/notices')
        .send({ ...validAllResidentsPayload(), title: '   ' });

      expect(missing.status).toBe(400);
      expect(missing.body.errors.title).toBeTruthy();
      expect(empty.status).toBe(400);
      expect(empty.body.errors.title).toBeTruthy();
    });

    it('rejects invalid category', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/notices')
        .send({ ...validAllResidentsPayload(), category: 'flyer' });

      expect(res.status).toBe(400);
      expect(res.body.errors.category).toBeTruthy();
    });

    it('rejects invalid building ID format', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/notices')
        .send({ ...validAllResidentsPayload(), building: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.building).toBeTruthy();
    });

    it('rejects nonexistent building', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/notices')
        .send({ ...validAllResidentsPayload(), building: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/referenced building does not exist/i);
    });

    it('accepts omitted description (defaults to empty string)', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/notices')
        .send({ title: 'No description notice', category: 'notice' });

      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('');
    });

    it('rejects non-string description', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/notices')
        .send({ ...validAllResidentsPayload(), description: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.errors.description).toBeTruthy();
    });

    it('accepts omitted expiresAt (defaults to null)', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/notices').send(validAllResidentsPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.expiresAt).toBeNull();
    });

    it('rejects invalid expiresAt', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/notices')
        .send({ ...validAllResidentsPayload(), expiresAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.expiresAt).toBeTruthy();
    });

    it('sets publishedAt to server time', async () => {
      const before = Date.now();
      const res = await authRequest(app, authToken).post('/api/v1/notices').send(validAllResidentsPayload());
      const after = Date.now();

      expect(res.status).toBe(201);
      const publishedAt = new Date(res.body.data.publishedAt).getTime();
      expect(publishedAt).toBeGreaterThanOrEqual(before);
      expect(publishedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('GET /api/v1/notices', () => {
    it('returns an empty list when no notices exist', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/notices');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns notices with populated building data', async () => {
      await Notice.create(validBuildingPayload());
      const res = await authRequest(app, authToken).get('/api/v1/notices');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].building).toMatchObject({
        name: 'Greenwood Heights',
        code: 'BLD-A',
      });
    });

    it('returns notices with building null (All residents)', async () => {
      await Notice.create(validAllResidentsPayload());
      const res = await authRequest(app, authToken).get('/api/v1/notices');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].building).toBeNull();
    });

    it('searches by title', async () => {
      await Notice.create([validAllResidentsPayload(), {
        title: 'Annual sports day',
        category: 'event',
      }]);

      const res = await authRequest(app, authToken).get('/api/v1/notices?search=maintenance');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Quarterly maintenance due');
    });

    it('searches by description', async () => {
      await Notice.create([validAllResidentsPayload(), {
        title: 'Water tank cleaning',
        category: 'notice',
        description: 'Tank on the terrace will be cleaned.',
      }]);

      const res = await authRequest(app, authToken).get('/api/v1/notices?search=terrace');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Water tank cleaning');
    });

    it('treats regex metacharacters in search as plain text', async () => {
      await Notice.create([validAllResidentsPayload(), {
        title: 'Fire safety (drill) on floor 3',
        category: 'announcement',
      }]);

      const specialTitle = await authRequest(app, authToken).get('/api/v1/notices?search=safety%20(drill)');
      const danglingBracket = await authRequest(app, authToken).get('/api/v1/notices?search=%5B');
      const literalDot = await authRequest(app, authToken).get('/api/v1/notices?search=safety.dril');

      expect(specialTitle.status).toBe(200);
      expect(specialTitle.body.data).toHaveLength(1);
      expect(specialTitle.body.data[0].title).toBe('Fire safety (drill) on floor 3');

      expect(danglingBracket.status).toBe(200);
      expect(danglingBracket.body.data).toHaveLength(0);

      expect(literalDot.status).toBe(200);
      expect(literalDot.body.data).toHaveLength(0);
    });

    it('filters by building query param', async () => {
      await Notice.create([
        { ...validBuildingPayload(), building: sampleBuilding._id },
        { ...validAllResidentsPayload(), title: 'Second notice' },
      ]);

      const res = await authRequest(app, authToken).get(`/api/v1/notices?building=${sampleBuilding._id}`);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].building.code).toBe('BLD-A');
    });

    it('combines search and building filter', async () => {
      await Notice.create([
        { ...validBuildingPayload(), building: sampleBuilding._id },
        { ...validAllResidentsPayload(), title: 'Power shutdown extension' },
      ]);

      const res = await authRequest(app, authToken).get(
        `/api/v1/notices?search=power&building=${sampleBuilding._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Power shutdown on Sunday');
    });

    it('returns empty array for invalid building ID in filter', async () => {
      await Notice.create(validAllResidentsPayload());
      const res = await authRequest(app, authToken).get('/api/v1/notices?building=invalid-id');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('sorts by publishedAt descending', async () => {
      const first = await Notice.create({
        title: 'First notice',
        category: 'notice',
        publishedAt: new Date('2026-08-01'),
      });
      const second = await Notice.create({
        title: 'Second notice',
        category: 'notice',
        publishedAt: new Date('2026-08-10'),
      });

      const res = await authRequest(app, authToken).get('/api/v1/notices');

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].title).toBe('Second notice');
      expect(res.body.data[1].title).toBe('First notice');
    });
  });

  describe('GET /api/v1/notices/:id', () => {
    it('returns one populated Notice', async () => {
      const created = await Notice.create(validBuildingPayload());
      const res = await authRequest(app, authToken).get(`/api/v1/notices/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Power shutdown on Sunday');
      expect(res.body.data.building.code).toBe('BLD-A');
    });

    it('returns one Notice with building null', async () => {
      const created = await Notice.create(validAllResidentsPayload());
      const res = await authRequest(app, authToken).get(`/api/v1/notices/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Quarterly maintenance due');
      expect(res.body.data.building).toBeNull();
    });

    it('returns 404 for invalid and nonexistent Notice IDs', async () => {
      const invalid = await authRequest(app, authToken).get('/api/v1/notices/invalid-id');
      const nonexistent = await authRequest(app, authToken)
        .get(`/api/v1/notices/${new mongoose.Types.ObjectId()}`);

      expect(invalid.status).toBe(404);
      expect(invalid.body.message).toBe('Notice not found');
      expect(nonexistent.status).toBe(404);
      expect(nonexistent.body.message).toBe('Notice not found');
    });
  });

  describe('PATCH /api/v1/notices/:id', () => {
    it('updates title, category, description, and expiresAt', async () => {
      const created = await Notice.create(validAllResidentsPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({
          title: ' Updated maintenance notice ',
          category: 'announcement',
          description: ' Updated description. ',
          expiresAt: new Date('2026-12-31').toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        title: 'Updated maintenance notice',
        category: 'announcement',
        description: 'Updated description.',
      });
      expect(new Date(res.body.data.expiresAt).toISOString()).toBe(new Date('2026-12-31').toISOString());
    });

    it('reassigns building', async () => {
      const created = await Notice.create(validBuildingPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ building: secondaryBuilding._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.building.code).toBe('BLD-B');
    });

    it('sets building to null (All residents)', async () => {
      const created = await Notice.create(validBuildingPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ building: null });

      expect(res.status).toBe(200);
      expect(res.body.data.building).toBeNull();
    });

    it('clears expiresAt by setting to null', async () => {
      const created = await Notice.create(validBuildingPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ expiresAt: null });

      expect(res.status).toBe(200);
      expect(res.body.data.expiresAt).toBeNull();
    });

    it('rejects empty title', async () => {
      const created = await Notice.create(validAllResidentsPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ title: ' ' });

      expect(res.status).toBe(400);
      expect(res.body.errors.title).toBeTruthy();
    });

    it('rejects invalid category', async () => {
      const created = await Notice.create(validAllResidentsPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ category: 'flyer' });

      expect(res.status).toBe(400);
      expect(res.body.errors.category).toBeTruthy();
    });

    it('rejects invalid building', async () => {
      const created = await Notice.create(validAllResidentsPayload());
      const invalid = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ building: 'invalid-id' });
      const nonexistent = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ building: new mongoose.Types.ObjectId().toString() });

      expect(invalid.status).toBe(400);
      expect(nonexistent.status).toBe(400);
    });

    it('rejects non-string description', async () => {
      const created = await Notice.create(validAllResidentsPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ description: 123 });

      expect(res.status).toBe(400);
      expect(res.body.errors.description).toBeTruthy();
    });

    it('rejects invalid expiresAt', async () => {
      const created = await Notice.create(validAllResidentsPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${created._id}`)
        .send({ expiresAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.expiresAt).toBeTruthy();
    });

    it('returns 404 for nonexistent Notice', async () => {
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/notices/${new mongoose.Types.ObjectId()}`)
        .send({ title: 'Missing' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Notice not found');
    });
  });

  describe('DELETE /api/v1/notices/:id', () => {
    it('deletes only the Notice', async () => {
      const created = await Notice.create(validBuildingPayload());
      const res = await authRequest(app, authToken).delete(`/api/v1/notices/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Notice deleted successfully');
      expect(await Notice.findById(created._id)).toBeNull();
      expect(await Building.findById(sampleBuilding._id)).not.toBeNull();
    });

    it('returns 404 for a nonexistent Notice', async () => {
      const res = await authRequest(app, authToken)
        .delete(`/api/v1/notices/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Notice not found');
    });
  });
});
