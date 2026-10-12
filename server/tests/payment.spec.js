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
const Resident = require('../src/models/Resident');
const User = require('../src/models/User');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Payment API (/api/v1/payments)', () => {
  let authToken;
  let sampleBuilding;
  let sampleUnit;
  let pendingBill;
  let overdueBill;
  let paidBill;

  const billPayload = (overrides = {}) => ({
    unit: sampleUnit._id.toString(),
    period: 'Jan 2026',
    amount: 5000,
    description: 'Monthly maintenance',
    dueDate: '2026-01-31',
    ...overrides,
  });

  const validPayload = () => ({
    bill: pendingBill._id.toString(),
    amount: 5000,
    method: 'upi',
  });

  const minimalPayload = () => ({
    bill: pendingBill._id.toString(),
    amount: 3000,
    method: 'cash',
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
    await Payment.deleteMany({});
    await Bill.deleteMany({});
    await Unit.deleteMany({});
    await Building.deleteMany({});

    sampleBuilding = await Building.create({
      code: 'BLD-A',
      name: 'Greenwood Heights',
    });

    sampleUnit = await Unit.create({
      unitNumber: '101',
      building: sampleBuilding._id,
    });

    pendingBill = await Bill.create({
      ...billPayload(),
      status: 'pending',
    });

    overdueBill = await Bill.create({
      ...billPayload({ period: 'Dec 2025', amount: 4000 }),
      status: 'overdue',
    });

    paidBill = await Bill.create({
      ...billPayload({ period: 'Nov 2025', amount: 5000 }),
      status: 'paid',
      paidAt: new Date(),
    });
  });

  describe('POST /api/v1/payments', () => {
    it('creates a payment with Bill populated (nested Unit → Building)', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/payments').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Payment recorded successfully');
      expect(res.body.data).toMatchObject({
        amount: 5000,
        method: 'upi',
        status: 'completed',
      });
      expect(res.body.data.paymentNo).toMatch(/^PAY-/);
      expect(res.body.data.bill).toMatchObject({
        period: 'Jan 2026',
        unit: {
          unitNumber: '101',
          building: { name: 'Greenwood Heights', code: 'BLD-A' },
        },
      });
    });

    it('auto-generates paymentNo when omitted', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/payments').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.paymentNo).toMatch(/^PAY-/);
    });

    it('rejects duplicate paymentNo', async () => {
      await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), paymentNo: 'PAY-DUP-001' });

      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...minimalPayload(), paymentNo: 'PAY-DUP-001' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('defaults status to completed when omitted', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/payments').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('completed');
    });

    it('defaults paidAt to current date', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/payments').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.paidAt).toBeTruthy();
      expect(new Date(res.body.data.paidAt).getTime()).toBeGreaterThan(0);
    });

    it('recalculates Bill status to paid when full amount paid', async () => {
      await authRequest(app, authToken).post('/api/v1/payments').send({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('paid');
      expect(updatedBill.paidAt).toBeTruthy();
    });

    it('handles partial payment (Bill stays pending)', async () => {
      await authRequest(app, authToken).post('/api/v1/payments').send({
        bill: pendingBill._id.toString(),
        amount: 3000,
        method: 'cash',
      });

      const updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('pending');
      expect(updatedBill.paidAt).toBeNull();
    });

    it('handles multiple payments on same bill', async () => {
      await authRequest(app, authToken).post('/api/v1/payments').send({
        bill: pendingBill._id.toString(),
        amount: 3000,
        method: 'cash',
      });

      let updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('pending');

      await authRequest(app, authToken).post('/api/v1/payments').send({
        bill: pendingBill._id.toString(),
        amount: 2000,
        method: 'card',
      });

      updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('paid');
    });

    it('recalculates overdue Bill to paid', async () => {
      await authRequest(app, authToken).post('/api/v1/payments').send({
        bill: overdueBill._id.toString(),
        amount: 4000,
        method: 'bank_transfer',
      });

      const updatedBill = await Bill.findById(overdueBill._id);
      expect(updatedBill.status).toBe('paid');
    });

    it('rejects missing bill', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ amount: 100, method: 'cash' });

      expect(res.status).toBe(400);
      expect(res.body.errors.bill).toBeTruthy();
    });

    it('rejects invalid bill ID format', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), bill: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.bill).toBeTruthy();
    });

    it('rejects nonexistent bill reference', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), bill: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/referenced bill does not exist/i);
    });

    it('rejects missing amount', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), method: 'cash' });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects amount of 0', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects negative amount', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), amount: -100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects missing method', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.method).toBeTruthy();
    });

    it('rejects invalid method', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), method: 'bitcoin' });

      expect(res.status).toBe(400);
      expect(res.body.errors.method).toBeTruthy();
    });

    it('rejects invalid status', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('accepts explicit pending status', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), status: 'pending' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
    });

    it('accepts explicit failed status', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), status: 'failed' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('failed');
    });

    it('accepts all valid methods', async () => {
      const methods = ['cash', 'bank_transfer', 'upi', 'card', 'cheque'];

      for (const method of methods) {
        const bill = await Bill.create(billPayload({ period: `Test ${method}` }));
        const res = await authRequest(app, authToken)
          .post('/api/v1/payments')
          .send({ bill: bill._id.toString(), amount: 100, method });

        expect(res.status).toBe(201);
        expect(res.body.data.method).toBe(method);
      }
    });

    it('accepts reference and notes', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), reference: 'TXN-12345', notes: 'Paid via app' });

      expect(res.status).toBe(201);
      expect(res.body.data.reference).toBe('TXN-12345');
      expect(res.body.data.notes).toBe('Paid via app');
    });

    it('rejects non-string reference', async () => {
      const res = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ ...validPayload(), reference: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.errors.reference).toBeTruthy();
    });

    it('defaults reference and notes to empty strings', async () => {
      const res = await authRequest(app, authToken).post('/api/v1/payments').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.reference).toBe('');
      expect(res.body.data.notes).toBe('');
    });
  });

  describe('GET /api/v1/payments', () => {
    beforeEach(async () => {
      await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
        status: 'completed',
        reference: 'TXN-001',
        paidAt: new Date('2026-01-15'),
      });
      await Payment.create({
        bill: overdueBill._id.toString(),
        amount: 4000,
        method: 'cash',
        status: 'completed',
        paidAt: new Date('2026-01-10'),
      });
    });

    it('returns all payments with population', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].bill.unit.building.name).toBeTruthy();
    });

    it('searches across paymentNo', async () => {
      const payments = await Payment.find().limit(1);
      const searchTerm = payments[0].paymentNo;

      const res = await authRequest(app, authToken).get(`/api/v1/payments?search=${searchTerm}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('searches across reference', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments?search=TXN-001');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('filters by bill ID', async () => {
      const res = await authRequest(app, authToken).get(`/api/v1/payments?bill=${pendingBill._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].bill.id).toBe(pendingBill._id.toString());
    });

    it('filters by status', async () => {
      await Payment.create({ bill: pendingBill._id.toString(), amount: 100, method: 'card', status: 'pending' });
      const res = await authRequest(app, authToken).get('/api/v1/payments?status=pending');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('pending');
    });

    it('filters by method', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments?method=cash');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].method).toBe('cash');
    });

    it('filters by dateFrom', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments?dateFrom=2026-01-12');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('filters by dateTo', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments?dateTo=2026-01-12');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('returns empty array for invalid status', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments?status=invalid');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid method', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments?method=bitcoin');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid bill', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments?bill=invalid');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid building', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments?building=invalid');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('filters by building', async () => {
      const res = await authRequest(app, authToken).get(`/api/v1/payments?building=${sampleBuilding._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('paginates results with page and limit and reports total', async () => {
      for (let i = 0; i < 5; i += 1) {
        await Payment.create({ bill: pendingBill._id, amount: 100, method: 'cash' });
      }

      const res = await authRequest(app, authToken).get('/api/v1/payments?page=2&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toMatchObject({ page: 2, limit: 2, total: 7, totalPages: 4 });
    });
  });

  describe('GET /api/v1/payments/:id', () => {
    it('returns single payment with population', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken).get(`/api/v1/payments/${created._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.paymentNo).toBe(created.paymentNo);
      expect(res.body.data.bill.unit.unitNumber).toBe('101');
    });

    it('returns 404 for invalid ID format', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/payments/invalid');
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Payment not found');
    });

    it('returns 404 for nonexistent ID', async () => {
      const res = await authRequest(app, authToken).get(`/api/v1/payments/${new mongoose.Types.ObjectId()}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Payment not found');
    });
  });

  describe('PATCH /api/v1/payments/:id', () => {
    it('updates amount', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ amount: 6000 });

      expect(res.status).toBe(200);
      expect(res.body.data.amount).toBe(6000);
    });

    it('updates method', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ method: 'card' });

      expect(res.status).toBe(200);
      expect(res.body.data.method).toBe('card');
    });

    it('updates status and recalculates bill', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
        status: 'completed',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ status: 'failed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('failed');

      const updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('pending');
      expect(updatedBill.paidAt).toBeNull();
    });

    it('updates reference', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ reference: 'NEW-REF' });

      expect(res.status).toBe(200);
      expect(res.body.data.reference).toBe('NEW-REF');
    });

    it('updates notes', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ notes: 'Updated notes' });

      expect(res.status).toBe(200);
      expect(res.body.data.notes).toBe('Updated notes');
    });

    it('rejects change to paymentNo', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ paymentNo: 'PAY-HACKED' });

      expect(res.status).toBe(400);
      expect(res.body.errors.paymentNo).toBeTruthy();
    });

    it('rejects change to bill', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ bill: overdueBill._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.errors.bill).toBeTruthy();
    });

    it('recalculates bill to pending when completed→failed', async () => {
      const createRes = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 5000, method: 'upi' });
      const created = createRes.body.data;

      const billBefore = await Bill.findById(pendingBill._id);
      expect(billBefore.status).toBe('paid');

      await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created.id}`)
        .send({ status: 'failed' });

      const billAfter = await Bill.findById(pendingBill._id);
      expect(billAfter.status).toBe('pending');
      expect(billAfter.paidAt).toBeNull();
    });

    it('recalculates bill to paid when failed→completed', async () => {
      const createRes = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 5000, method: 'upi', status: 'failed' });
      const created = createRes.body.data;

      const billBefore = await Bill.findById(pendingBill._id);
      expect(billBefore.status).toBe('pending');

      await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created.id}`)
        .send({ status: 'completed' });

      const billAfter = await Bill.findById(pendingBill._id);
      expect(billAfter.status).toBe('paid');
    });

    it('does not clear paidAt when paid status stays paid', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
        status: 'completed',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ reference: 'updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.paidAt).toBeTruthy();
    });

    it('rejects amount of 0 on update', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects negative amount on update', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ amount: -100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects invalid method on update', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ method: 'bitcoin' });

      expect(res.status).toBe(400);
      expect(res.body.errors.method).toBeTruthy();
    });

    it('rejects invalid status on update', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('returns 404 for nonexistent payment', async () => {
      const res = await authRequest(app, authToken)
        .patch(`/api/v1/payments/${new mongoose.Types.ObjectId()}`)
        .send({ amount: 100 });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Payment not found');
    });
  });

  describe('DELETE /api/v1/payments/:id', () => {
    it('hard deletes payment and recalculates bill status', async () => {
      const createRes = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 5000, method: 'upi' });
      const created = createRes.body.data;

      const billBefore = await Bill.findById(pendingBill._id);
      expect(billBefore.status).toBe('paid');

      const res = await authRequest(app, authToken).delete(`/api/v1/payments/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Payment deleted successfully');
      expect(await Payment.findById(created.id)).toBeNull();

      const billAfter = await Bill.findById(pendingBill._id);
      expect(billAfter.status).toBe('pending');
      expect(billAfter.paidAt).toBeNull();
    });

    it('recalculates bill with multiple payments', async () => {
      const createRes1 = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 3000, method: 'cash' });
      const p1 = createRes1.body.data;

      const createRes2 = await authRequest(app, authToken)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 2000, method: 'card' });
      const p2 = createRes2.body.data;

      let bill = await Bill.findById(pendingBill._id);
      expect(bill.status).toBe('paid');

      await authRequest(app, authToken).delete(`/api/v1/payments/${p2.id}`);

      bill = await Bill.findById(pendingBill._id);
      expect(bill.status).toBe('pending');
    });

    it('returns 404 for nonexistent payment', async () => {
      const res = await authRequest(app, authToken)
        .delete(`/api/v1/payments/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Payment not found');
    });
  });

  describe('Resident scoped GET /api/v1/payments?bill= (Phase 27 H-1)', () => {
    let residentAUser, residentBUser;
    let unitA, unitB;
    let billA, billB;

    beforeEach(async () => {
      await Payment.deleteMany({});
      await Bill.deleteMany({});
      await Unit.deleteMany({});
      await Building.deleteMany({});
      await Resident.deleteMany({});
      await User.deleteMany({ role: 'resident' });

      const buildingA = await Building.create({ code: 'R-PAY-A', name: 'Resident Building A' });
      const buildingB = await Building.create({ code: 'R-PAY-B', name: 'Resident Building B' });

      unitA = await Unit.create({ unitNumber: 'RA-101', building: buildingA._id });
      unitB = await Unit.create({ unitNumber: 'RB-101', building: buildingB._id });

      const residentA = await Resident.create({ name: 'Resident A', unit: unitA._id, phone: '1111111111', type: 'owner', status: 'active' });
      const residentB = await Resident.create({ name: 'Resident B', unit: unitB._id, phone: '2222222222', type: 'owner', status: 'active' });

      residentAUser = await User.create({ name: 'Res A', email: 'resa-pay@test.local', password: 'password123', role: 'resident', status: 'active', resident: residentA._id });
      residentBUser = await User.create({ name: 'Res B', email: 'resb-pay@test.local', password: 'password123', role: 'resident', status: 'active', resident: residentB._id });

      billA = await Bill.create({ unit: unitA._id, period: 'Jan 2026', amount: 1000, status: 'pending' });
      billB = await Bill.create({ unit: unitB._id, period: 'Jan 2026', amount: 9000, status: 'pending' });

      await Payment.create({ bill: billA._id, amount: 1000, method: 'upi', status: 'completed' });
      await Payment.create({ bill: billB._id, amount: 9000, method: 'cash', status: 'completed' });
    });

    afterEach(async () => {
      await User.deleteMany({ role: 'resident' });
      await Resident.deleteMany({});
    });

    it('does not leak another unit resident payments when filtered by their bill', async () => {
      const token = `Bearer ${getAuthToken(residentAUser)}`;
      const res = await authRequest(app, token).get(`/api/v1/payments?bill=${billB._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('resident can still retrieve payments for their own bill', async () => {
      const token = `Bearer ${getAuthToken(residentAUser)}`;
      const res = await authRequest(app, token).get(`/api/v1/payments?bill=${billA._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].bill.id).toBe(billA._id.toString());
    });

    it('resident B cannot read resident A payments via ?bill=', async () => {
      const token = `Bearer ${getAuthToken(residentBUser)}`;
      const res = await authRequest(app, token).get(`/api/v1/payments?bill=${billA._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Staff scoped GET /api/v1/payments?bill= (Phase 35 H-1)', () => {
    let staffUser;
    let unitA, unitB;
    let billA, billB;

    beforeEach(async () => {
      await Payment.deleteMany({});
      await Bill.deleteMany({});
      await Unit.deleteMany({});
      await Building.deleteMany({});
      await Resident.deleteMany({});
      await User.deleteMany({}); // includes the staff user below

      const buildingA = await Building.create({ code: 'STAFF-PAY-A', name: 'Staff Building A' });
      const buildingB = await Building.create({ code: 'STAFF-PAY-B', name: 'Staff Building B' });

      unitA = await Unit.create({ unitNumber: 'SA-101', building: buildingA._id });
      unitB = await Unit.create({ unitNumber: 'SB-101', building: buildingB._id });

      // Staff is assigned ONLY to building A.
      staffUser = await User.create({
        name: 'Staff A',
        email: 'staff-a-pay@test.local',
        password: 'password123',
        role: 'staff',
        status: 'active',
        buildings: [buildingA._id],
      });

      billA = await Bill.create({ unit: unitA._id, period: 'Jan 2026', amount: 1000, status: 'pending' });
      billB = await Bill.create({ unit: unitB._id, period: 'Jan 2026', amount: 9000, status: 'pending' });

      await Payment.create({ bill: billA._id, amount: 1000, method: 'upi', status: 'completed' });
      await Payment.create({ bill: billB._id, amount: 9000, method: 'cash', status: 'completed' });
    });

    afterEach(async () => {
      await Payment.deleteMany({});
      await Bill.deleteMany({});
      await Unit.deleteMany({});
      await Building.deleteMany({});
      await User.deleteMany({});
    });

    it('does not expose Building B payments when staff filters by an out-of-scope bill', async () => {
      const token = `Bearer ${getAuthToken(staffUser)}`;
      const res = await authRequest(app, token).get(`/api/v1/payments?bill=${billB._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('staff can still retrieve payments for a bill in their assigned building', async () => {
      const token = `Bearer ${getAuthToken(staffUser)}`;
      const res = await authRequest(app, token).get(`/api/v1/payments?bill=${billA._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].bill.id).toBe(billA._id.toString());
    });
  });

  describe('Resident payment integrity (Phase 41)', () => {
    let residentUser;
    let residentBuilding;
    let residentUnit;
    let residentBill;
    let adminUser;
    let adminToken;

    const residentToken = () => `Bearer ${getAuthToken(residentUser)}`;

    const createResidentFixture = async (suffix, buildingCode, unitNumber) => {
      const building = await Building.create({ code: buildingCode, name: `Phase41 ${suffix}` });
      const unit = await Unit.create({ unitNumber, building: building._id });
      const resident = await Resident.create({
        name: `P41 Resident ${suffix}`,
        unit: unit._id,
        phone: '9999999999',
        type: 'owner',
        status: 'active',
      });
      const user = await User.create({
        name: `P41 User ${suffix}`,
        email: `p41-${suffix}@test.local`,
        password: 'password123',
        role: 'resident',
        status: 'active',
        resident: resident._id,
      });
      return { building, unit, resident, user };
    };

    beforeEach(async () => {
      await Payment.deleteMany({});
      await Bill.deleteMany({});
      await Unit.deleteMany({});
      await Building.deleteMany({});
      await Resident.deleteMany({});
      await User.deleteMany({ role: 'resident' });

      const fixture = await createResidentFixture('A', 'P41-BLD-A', 'P41-101');
      residentUser = fixture.user;
      residentBuilding = fixture.building;
      residentUnit = fixture.unit;

      residentBill = await Bill.create({
        unit: residentUnit._id,
        period: 'P41',
        amount: 5000,
        status: 'pending',
      });

      adminUser = await User.create({
        name: 'P41 Admin',
        email: 'p41-admin@test.local',
        password: 'password123',
        role: 'admin',
        status: 'active',
      });
      adminToken = `Bearer ${getAuthToken(adminUser)}`;
    });

    afterEach(async () => {
      await User.deleteMany({ role: 'resident' });
      await Resident.deleteMany({});
      if (adminUser) {
        await User.findByIdAndDelete(adminUser._id);
        adminUser = null;
      }
    });

    it('creates a pending payment when a resident omits status', async () => {
      const res = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 1000, method: 'upi' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
    });

    it('rejects a resident-supplied completed status', async () => {
      const res = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 1000, method: 'upi', status: 'completed' });

      expect(res.status).toBe(403);
      expect(await Payment.countDocuments({ bill: residentBill._id })).toBe(0);
    });

    it('rejects a resident-supplied failed status (pending-only policy)', async () => {
      const res = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 1000, method: 'upi', status: 'failed' });

      expect(res.status).toBe(403);
      expect(await Payment.countDocuments({ bill: residentBill._id })).toBe(0);
    });

    it('a pending resident payment does not mark the bill paid', async () => {
      const res = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 5000, method: 'upi' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');

      const bill = await Bill.findById(residentBill._id);
      expect(bill.status).toBe('pending');
      expect(bill.paidAt).toBeNull();
    });

    it('admin can complete a payment through the existing authorized workflow', async () => {
      const res = await authRequest(app, adminToken)
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 5000, method: 'cash', status: 'completed' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('completed');

      const bill = await Bill.findById(residentBill._id);
      expect(bill.status).toBe('paid');
      expect(bill.paidAt).toBeTruthy();
    });

    it('only completed payments contribute to bill settlement', async () => {
      const pendingRes = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 5000, method: 'upi' });
      expect(pendingRes.status).toBe(201);
      expect(pendingRes.body.data.status).toBe('pending');

      let bill = await Bill.findById(residentBill._id);
      expect(bill.status).toBe('pending');
      expect(bill.paidAt).toBeNull();

      const completed = await authRequest(app, adminToken)
        .patch(`/api/v1/payments/${pendingRes.body.data.id}`)
        .send({ status: 'completed' });
      expect(completed.status).toBe(200);
      expect(completed.body.data.status).toBe('completed');

      bill = await Bill.findById(residentBill._id);
      expect(bill.status).toBe('paid');
      expect(bill.paidAt).toBeTruthy();
    });

    it('resident cannot overpay beyond the outstanding balance', async () => {
      const res = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 6000, method: 'upi' });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
      expect(await Payment.countDocuments({ bill: residentBill._id })).toBe(0);
    });

    it('resident cannot create a payment against an already-paid bill', async () => {
      await Payment.create({
        bill: residentBill._id,
        amount: 5000,
        method: 'cash',
        status: 'completed',
      });
      await Bill.findByIdAndUpdate(residentBill._id, { status: 'paid', paidAt: new Date() });

      const res = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 100, method: 'upi' });

      expect(res.status).toBe(400);
      expect(await Payment.countDocuments({ bill: residentBill._id })).toBe(1);
    });

    it('partial payment does not downgrade an overdue bill', async () => {
      const overdueBill = await Bill.create({
        unit: residentUnit._id,
        period: 'P41-overdue',
        amount: 4000,
        status: 'overdue',
      });

      const res = await authRequest(app, adminToken)
        .post('/api/v1/payments')
        .send({ bill: overdueBill._id.toString(), amount: 1000, method: 'cash', status: 'completed' });

      expect(res.status).toBe(201);

      const bill = await Bill.findById(overdueBill._id);
      expect(bill.status).toBe('overdue');
      expect(bill.paidAt).toBeNull();
    });

    it('multiple partial resident claims settle only after verification', async () => {
      const first = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 2000, method: 'cash' });
      const second = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 3000, method: 'card' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      let bill = await Bill.findById(residentBill._id);
      expect(bill.status).toBe('pending');
      expect(bill.paidAt).toBeNull();

      await authRequest(app, adminToken)
        .patch(`/api/v1/payments/${first.body.data.id}`)
        .send({ status: 'completed' });

      bill = await Bill.findById(residentBill._id);
      expect(bill.status).toBe('pending');

      await authRequest(app, adminToken)
        .patch(`/api/v1/payments/${second.body.data.id}`)
        .send({ status: 'completed' });

      bill = await Bill.findById(residentBill._id);
      expect(bill.status).toBe('paid');
    });

    it('resident cannot create a payment for another unit bill (403)', async () => {
      const otherFixture = await createResidentFixture('B', 'P41-BLD-B', 'P41-201');
      const otherBill = await Bill.create({
        unit: otherFixture.unit._id,
        period: 'P41-B',
        amount: 1000,
        status: 'pending',
      });

      const res = await authRequest(app, residentToken())
        .post('/api/v1/payments')
        .send({ bill: otherBill._id.toString(), amount: 100, method: 'cash' });

      expect(res.status).toBe(403);
      expect(await Payment.countDocuments({ bill: otherBill._id })).toBe(0);
    });

    it('staff can still record payments for bills in their assigned building', async () => {
      const staff = await User.create({
        name: 'P41 Staff',
        email: 'p41-staff@test.local',
        password: 'password123',
        role: 'staff',
        status: 'active',
        buildings: [residentBuilding._id],
      });

      const res = await authRequest(app, `Bearer ${getAuthToken(staff)}`)
        .post('/api/v1/payments')
        .send({ bill: residentBill._id.toString(), amount: 1000, method: 'cash' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('completed');

      await User.findByIdAndDelete(staff._id);
    });
  });
});
