process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Bill = require('../src/models/Bill');
const Payment = require('../src/models/Payment');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');

describe('Bill API (/api/v1/billing)', () => {
  let sampleBuilding;
  let secondaryBuilding;
  let sampleUnit;
  let secondaryUnit;

  const validPayload = () => ({
    unit: sampleUnit._id.toString(),
    period: 'Jan 2026',
    amount: 5000,
    description: 'Monthly maintenance charge',
    dueDate: '2026-01-31',
  });

  const minimalPayload = () => ({
    unit: sampleUnit._id.toString(),
    period: 'Feb 2026',
    amount: 3000,
  });

  beforeAll(async () => {
    await startMemoryDb();
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await Payment.deleteMany({});
    await Bill.deleteMany({});
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
      unitNumber: '101',
      building: sampleBuilding._id,
    });
    secondaryUnit = await Unit.create({
      unitNumber: '202',
      building: secondaryBuilding._id,
    });
  });

  describe('POST /api/v1/billing', () => {
    it('creates a bill with Unit and Building populated', async () => {
      const res = await request(app).post('/api/v1/billing').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Bill created successfully');
      expect(res.body.data).toMatchObject({
        period: 'Jan 2026',
        amount: 5000,
        description: 'Monthly maintenance charge',
        unit: {
          unitNumber: '101',
          building: { name: 'Greenwood Heights', code: 'BLD-A' },
        },
      });
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.billNo).toBeTruthy();
    });

    it('auto-generates billNo when omitted', async () => {
      const res = await request(app).post('/api/v1/billing').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.billNo).toMatch(/^BILL-/);
    });

    it('accepts an explicit billNo', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), billNo: 'BILL-20260101-001' });

      expect(res.status).toBe(201);
      expect(res.body.data.billNo).toBe('BILL-20260101-001');
    });

    it('rejects duplicate billNo', async () => {
      await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), billNo: 'BILL-DUP-001' });

      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), billNo: 'BILL-DUP-001', amount: 4000 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('defaults status to pending and paidAt to null', async () => {
      const res = await request(app).post('/api/v1/billing').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.paidAt).toBeNull();
    });

    it('defaults description to empty string when omitted', async () => {
      const res = await request(app).post('/api/v1/billing').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('');
    });

    it('defaults dueDate to null when omitted', async () => {
      const res = await request(app).post('/api/v1/billing').send(minimalPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.dueDate).toBeNull();
    });

    it('rejects missing unit', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ period: 'Jan 2026', amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
    });

    it('rejects invalid unit ID format', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), unit: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
    });

    it('rejects nonexistent unit reference', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), unit: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/referenced unit does not exist/i);
    });

    it('rejects missing period', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ unit: sampleUnit._id.toString(), amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.period).toBeTruthy();
    });

    it('rejects empty period', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), period: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errors.period).toBeTruthy();
    });

    it('rejects missing amount', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ unit: sampleUnit._id.toString(), period: 'Jan 2026' });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects amount of 0', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects negative amount', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), amount: -100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects non-numeric amount', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), amount: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects invalid dueDate format', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), dueDate: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.dueDate).toBeTruthy();
    });

    it('trims period', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), period: '  Mar 2026  ' });

      expect(res.status).toBe(201);
      expect(res.body.data.period).toBe('Mar 2026');
    });

    it('trims billNo', async () => {
      const res = await request(app)
        .post('/api/v1/billing')
        .send({ ...minimalPayload(), billNo: '  BILL-TRIM-001  ' });

      expect(res.status).toBe(201);
      expect(res.body.data.billNo).toBe('BILL-TRIM-001');
    });
  });

  describe('GET /api/v1/billing', () => {
    it('returns an empty list when no bills exist', async () => {
      const res = await request(app).get('/api/v1/billing');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns bills with populated Unit and Building data', async () => {
      await Bill.create(validPayload());
      const res = await request(app).get('/api/v1/billing');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit).toMatchObject({
        unitNumber: '101',
        building: { name: 'Greenwood Heights', code: 'BLD-A' },
      });
    });

    it('sorts by createdAt descending (newest first)', async () => {
      await Bill.create({ ...minimalPayload(), period: 'Jan 2026' });
      const older = await Bill.findOne({ period: 'Jan 2026' });
      await Bill.updateOne({ _id: older._id }, { $set: { createdAt: new Date('2026-01-01') } });
      await Bill.create({ ...minimalPayload(), period: 'Feb 2026', amount: 4000 });

      const res = await request(app).get('/api/v1/billing');

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].period).toBe('Feb 2026');
      expect(res.body.data[1].period).toBe('Jan 2026');
    });

    it('searches by billNo', async () => {
      await Bill.create({ ...validPayload(), billNo: 'BILL-SEARCH-001' });
      await Bill.create({ ...minimalPayload(), billNo: 'BILL-OTHER-002' });

      const res = await request(app).get('/api/v1/billing?search=SEARCH');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].billNo).toBe('BILL-SEARCH-001');
    });

    it('searches by period', async () => {
      await Bill.create(validPayload());
      await Bill.create({ ...minimalPayload(), period: 'Mar 2026' });

      const res = await request(app).get('/api/v1/billing?search=Jan');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].period).toBe('Jan 2026');
    });

    it('searches by description', async () => {
      await Bill.create(validPayload());
      await Bill.create({ ...minimalPayload(), description: 'Special assessment' });

      const res = await request(app).get('/api/v1/billing?search=maintenance');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].description).toBe('Monthly maintenance charge');
    });

    it('searches case-insensitively', async () => {
      await Bill.create(validPayload());

      const res = await request(app).get('/api/v1/billing?search=JAN');

      expect(res.body.data).toHaveLength(1);
    });

    it('treats regex metacharacters in search as plain text', async () => {
      await Bill.create({ ...validPayload(), description: 'A (B) bill' });

      const res = await request(app).get('/api/v1/billing?search=(B)');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].description).toBe('A (B) bill');
    });

    it('filters by building query param', async () => {
      await Bill.create(validPayload());
      await Bill.create({
        ...minimalPayload(),
        unit: secondaryUnit._id.toString(),
      });

      const res = await request(app).get(
        `/api/v1/billing?building=${sampleBuilding._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unit.building.code).toBe('BLD-A');
    });

    it('filters by status query param', async () => {
      await Bill.create(validPayload());
      await Bill.create({ ...minimalPayload(), status: 'paid', paidAt: new Date() });

      const res = await request(app).get('/api/v1/billing?status=pending');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('pending');
    });

    it('combines search and filters', async () => {
      await Bill.create({ ...validPayload(), billNo: 'BILL-COMBO-001' });
      await Bill.create({
        ...minimalPayload(),
        unit: secondaryUnit._id.toString(),
        billNo: 'BILL-COMBO-002',
      });

      const res = await request(app).get(
        `/api/v1/billing?search=COMBO&building=${sampleBuilding._id}`
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].billNo).toBe('BILL-COMBO-001');
    });

    it('returns empty array for invalid building ID in filter', async () => {
      await Bill.create(validPayload());
      const res = await request(app).get('/api/v1/billing?building=invalid-id');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid status in filter', async () => {
      await Bill.create(validPayload());
      const res = await request(app).get('/api/v1/billing?status=invalid');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/billing/:id', () => {
    it('returns one populated bill', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app).get(`/api/v1/billing/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.period).toBe('Jan 2026');
      expect(res.body.data.unit.unitNumber).toBe('101');
      expect(res.body.data.unit.building.code).toBe('BLD-A');
      expect(res.body.data.amount).toBe(5000);
    });

    it('returns 404 for invalid and nonexistent IDs', async () => {
      const invalid = await request(app).get('/api/v1/billing/invalid-id');
      const nonexistent = await request(app)
        .get(`/api/v1/billing/${new mongoose.Types.ObjectId()}`);

      expect(invalid.status).toBe(404);
      expect(invalid.body.message).toBe('Bill not found');
      expect(nonexistent.status).toBe(404);
      expect(nonexistent.body.message).toBe('Bill not found');
    });
  });

  describe('PATCH /api/v1/billing/:id', () => {
    it('updates period, amount, description, and status', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({
          period: 'Mar 2026',
          amount: 7500,
          description: 'Updated description',
          status: 'overdue',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        period: 'Mar 2026',
        amount: 7500,
        description: 'Updated description',
        status: 'overdue',
      });
    });

    it('updates dueDate', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ dueDate: '2026-03-31' });

      expect(res.status).toBe(200);
      const updatedDate = new Date(res.body.data.dueDate);
      expect(updatedDate.toISOString().startsWith('2026-03-31')).toBe(true);
    });

    it('clears dueDate by setting to null', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ dueDate: null });

      expect(res.status).toBe(200);
      expect(res.body.data.dueDate).toBeNull();
    });

    it('rejects billNo change', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ billNo: 'BILL-CHANGED-001' });

      expect(res.status).toBe(400);
      expect(res.body.errors.billNo).toBeTruthy();
    });

    it('rejects unit change', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ unit: secondaryUnit._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.errors.unit).toBeTruthy();
    });

    it('sets paidAt when status changes from pending to paid', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ status: 'paid' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.paidAt).toBeTruthy();
    });

    it('sets paidAt when status changes from overdue to paid', async () => {
      const created = await Bill.create({ ...validPayload(), status: 'overdue' });
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ status: 'paid' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.paidAt).toBeTruthy();
    });

    it('preserves existing paidAt when status stays paid', async () => {
      const existingPaidAt = new Date('2026-01-15');
      const created = await Bill.create({
        ...validPayload(),
        status: 'paid',
        paidAt: existingPaidAt,
      });
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ description: 'Updated' });

      expect(res.status).toBe(200);
      expect(new Date(res.body.data.paidAt).toISOString()).toBe(existingPaidAt.toISOString());
    });

    it('clears paidAt when status changes from paid to pending', async () => {
      const created = await Bill.create({
        ...validPayload(),
        status: 'paid',
        paidAt: new Date(),
      });
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ status: 'pending' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.paidAt).toBeNull();
    });

    it('clears paidAt when status changes from paid to overdue', async () => {
      const created = await Bill.create({
        ...validPayload(),
        status: 'paid',
        paidAt: new Date(),
      });
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ status: 'overdue' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('overdue');
      expect(res.body.data.paidAt).toBeNull();
    });

    it('rejects empty period on update', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ period: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errors.period).toBeTruthy();
    });

    it('rejects amount of 0 on update', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects negative amount on update', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ amount: -50 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects non-numeric amount on update', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ amount: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects invalid status on update', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ status: 'invalid-status' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('rejects invalid dueDate on update', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app)
        .patch(`/api/v1/billing/${created._id}`)
        .send({ dueDate: 'not-a-date' });

      expect(res.status).toBe(400);
      expect(res.body.errors.dueDate).toBeTruthy();
    });

    it('returns 404 for nonexistent bill', async () => {
      const res = await request(app)
        .patch(`/api/v1/billing/${new mongoose.Types.ObjectId()}`)
        .send({ amount: 100 });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Bill not found');
    });
  });

  describe('DELETE /api/v1/billing/:id', () => {
    it('deletes only the bill record', async () => {
      const created = await Bill.create(validPayload());
      const res = await request(app).delete(`/api/v1/billing/${created._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Bill deleted successfully');
      expect(await Bill.findById(created._id)).toBeNull();
      expect(await Unit.findById(sampleUnit._id)).not.toBeNull();
      expect(await Building.findById(sampleBuilding._id)).not.toBeNull();
    });

    it('returns 404 for a nonexistent bill', async () => {
      const res = await request(app)
        .delete(`/api/v1/billing/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Bill not found');
    });

    it('rejects deletion when payments exist for the bill', async () => {
      const bill = await Bill.create(validPayload());
      await Payment.create({
        bill: bill._id.toString(),
        amount: 5000,
        method: 'upi',
        status: 'completed',
      });

      const res = await request(app).delete(`/api/v1/billing/${bill._id}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot delete bill with existing payments/i);
      expect(await Bill.findById(bill._id)).not.toBeNull();
    });
  });
});
