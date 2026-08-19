process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Expense = require('../src/models/Expense');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Expense API (/api/v1/expenses)', () => {
  let authToken;
  let sampleBuilding;
  let secondaryBuilding;

  const validPayload = () => ({
    category: 'utilities',
    building: sampleBuilding._id.toString(),
    description: 'Common area electricity bill',
    amount: 18400,
    date: '2026-08-10',
  });

  const minimalPayload = () => ({
    category: 'maintenance',
    building: sampleBuilding._id.toString(),
    amount: 5000,
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
    await Expense.deleteMany({});
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

  describe('POST /api/v1/expenses', () => {
    it('creates an expense with Building populated', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/expenses').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Expense created successfully');
      expect(res.body.data).toMatchObject({
        category: 'utilities',
        description: 'Common area electricity bill',
        amount: 18400,
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.building.id).toBeTruthy();
    });

    it('defaults status to pending and date to now when omitted', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/expenses').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.date).toBeTruthy();
    });

    it('defaults description to empty string when omitted', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/expenses').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('');
    });

    it('accepts explicit status', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), status: 'approved' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('approved');
    });

    it('accepts all valid categories', async () => {
      const categories = ['maintenance', 'utilities', 'housekeeping', 'security', 'landscaping', 'admin', 'other'];

      for (const category of categories) {
        const res = await authRequest(app, authToken)
          .post('/api/v1/expenses')
          .send({ ...minimalPayload(), category, amount: 100 + categories.indexOf(category) });

        expect(res.status).toBe(201);
        expect(res.body.data.category).toBe(category);
      }
    });

    it('rejects missing category', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ building: sampleBuilding._id.toString(), amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.category).toBeTruthy();
    });

    it('rejects invalid category', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), category: 'invalid-cat' });

      expect(res.status).toBe(400);
      expect(res.body.errors.category).toBeTruthy();
    });

    it('rejects missing building', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ category: 'utilities', amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.building).toBeTruthy();
    });

    it('rejects invalid building ID format', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), building: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.building).toBeTruthy();
    });

    it('rejects nonexistent building reference', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), building: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/referenced building does not exist/i);
    });

    it('rejects missing amount', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ category: 'utilities', building: sampleBuilding._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects amount of 0', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects negative amount', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), amount: -100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects non-numeric amount', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), amount: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects invalid date format', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), date: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.date).toBeTruthy();
    });

    it('rejects invalid status', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), status: 'invalid-status' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('trims category', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/expenses')
        .send({ ...minimalPayload(), category: '  utilities  ' });

      expect(res.status).toBe(201);
      expect(res.body.data.category).toBe('utilities');
    });
  });

  describe('GET /api/v1/expenses', () => {
    it('returns an empty list when no expenses exist', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/expenses');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns expenses with populated Building data', async () => {
      await Expense.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/expenses');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].building).toMatchObject({
        name: 'Greenwood Heights',
        code: 'BLD-A',
      });
    });

    it('sorts by date descending (newest first)', async () => {
      await Expense.create({
        ...minimalPayload(),
        date: new Date('2026-08-01'),
      });
      await Expense.create({
        ...minimalPayload(),
        category: 'housekeeping',
        date: new Date('2026-08-15'),
      });

      const res = await authRequest(app, authToken).get('/api/v1/expenses');

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].category).toBe('housekeeping');
      expect(res.body.data[1].category).toBe('maintenance');
    });

    it('searches by category', async () => {
      await Expense.create(validPayload());
      await Expense.create({
        ...minimalPayload(),
        category: 'housekeeping',
        description: 'Cleaning supplies',
      });

      const res = await authRequest(app, authToken).get('/api/v1/expenses?search=utilities');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].category).toBe('utilities');
    });

    it('searches by description', async () => {
      await Expense.create(validPayload());
      await Expense.create({
        ...minimalPayload(),
        category: 'housekeeping',
        description: 'Cleaning supplies',
      });

      const res = await authRequest(app, authToken).get('/api/v1/expenses?search=electricity');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].description).toBe('Common area electricity bill');
    });

    it('searches case-insensitively', async () => {
      await Expense.create(validPayload());

      const res = await authRequest(app, authToken).get('/api/v1/expenses?search=UTILITIES');

      expect(res.body.data).toHaveLength(1);
    });

    it('treats regex metacharacters in search as plain text', async () => {
      await Expense.create(validPayload());
      await Expense.create({
        ...minimalPayload(),
        description: 'A (B) expense',
      });

      const res = await authRequest(app, authToken).get('/api/v1/expenses?search=(B)');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].description).toBe('A (B) expense');
    });

    it('filters by building query param', async () => {
      await Expense.create(validPayload());
      await Expense.create({
        ...minimalPayload(),
        building: secondaryBuilding._id.toString(),
        category: 'housekeeping',
      });

      const res = await authRequest(app, authToken).get(
        `/api/v1/expenses?building=${sampleBuilding._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].category).toBe('utilities');
    });

    it('filters by status query param', async () => {
      await Expense.create(validPayload());
      await Expense.create({
        ...minimalPayload(),
        status: 'approved',
      });

      const res = await authRequest(app, authToken).get('/api/v1/expenses?status=pending');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('pending');
    });

    it('filters by category query param', async () => {
      await Expense.create(validPayload());
      await Expense.create({
        ...minimalPayload(),
        category: 'housekeeping',
      });

      const res = await authRequest(app, authToken).get('/api/v1/expenses?category=utilities');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].category).toBe('utilities');
    });

    it('combines search and filters', async () => {
      await Expense.create(validPayload());
      await Expense.create({
        ...minimalPayload(),
        building: secondaryBuilding._id.toString(),
        category: 'utilities',
      });

      const res = await authRequest(app, authToken).get(
        `/api/v1/expenses?search=electricity&building=${sampleBuilding._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].building.code).toBe('BLD-A');
    });

    it('returns empty array for invalid building ID in filter', async () => {
      await Expense.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/expenses?building=invalid-id');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid status in filter', async () => {
      await Expense.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/expenses?status=invalid');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid category in filter', async () => {
      await Expense.create(validPayload());
      const res = await authRequest(app, authToken).get('/api/v1/expenses?category=invalid');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/expenses/:id', () => {
    it('returns one populated expense', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken).get(`/api/v1/expenses/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.category).toBe('utilities');
      expect(res.body.data.building.code).toBe('BLD-A');
      expect(res.body.data.amount).toBe(18400);
    });

    it('returns 404 for invalid and nonexistent IDs', async () => {
      const invalid = await authRequest(app, authToken).get('/api/v1/expenses/invalid-id');
      const nonexistent = await authRequest(app, authToken)
        .get(`/api/v1/expenses/${new mongoose.Types.ObjectId()}`);

      expect(invalid.status).toBe(404);
      expect(invalid.body.message).toBe('Expense not found');
      expect(nonexistent.status).toBe(404);
      expect(nonexistent.body.message).toBe('Expense not found');
    });
  });

  describe('PATCH /api/v1/expenses/:id', () => {
    it('updates category, amount, description, and status', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({
          category: 'security',
          amount: 25000,
          description: 'Updated description',
          status: 'approved',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        category: 'security',
        amount: 25000,
        description: 'Updated description',
        status: 'approved',
      });
    });

    it('updates date', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({ date: '2026-09-01' });

      expect(res.status).toBe(200);
      const updatedDate = new Date(res.body.data.date);
      expect(updatedDate.toISOString().startsWith('2026-09-01')).toBe(true);
    });

    it('rejects empty category on update', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({ category: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errors.category).toBeTruthy();
    });

    it('rejects invalid category on update', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({ category: 'invalid-cat' });

      expect(res.status).toBe(400);
      expect(res.body.errors.category).toBeTruthy();
    });

    it('rejects amount of 0 on update', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({ amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects negative amount on update', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({ amount: -50 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects non-numeric amount on update', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({ amount: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects invalid status on update', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({ status: 'invalid-status' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('rejects invalid date on update', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${created._id}`)
        .send({ date: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.date).toBeTruthy();
    });

    it('returns 404 for nonexistent expense', async () => {
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/expenses/${new mongoose.Types.ObjectId()}`)
        .send({ amount: 100 });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Expense not found');
    });
  });

  describe('DELETE /api/v1/expenses/:id', () => {
    it('deletes only the expense record', async () => {
      const created = await Expense.create(validPayload());
      const res = await authRequest(app, authToken).delete(`/api/v1/expenses/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Expense deleted successfully');
      expect(await Expense.findById(created._id)).toBeNull();
      expect(await Building.findById(sampleBuilding._id)).not.toBeNull();
    });

    it('returns 404 for a nonexistent expense', async () => {
      const res = await authRequest(app, authToken)
        .delete(`/api/v1/expenses/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Expense not found');
    });
  });
});
