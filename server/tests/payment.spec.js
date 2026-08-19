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

describe('Payment API (/api/v1/payments)', () => {
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
      const res = await request(app).post('/api/v1/payments').send(validPayload());

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
      const res = await request(app).post('/api/v1/payments').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.paymentNo).toMatch(/^PAY-/);
    });

    it('rejects duplicate paymentNo', async () => {
      await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), paymentNo: 'PAY-DUP-001' });

      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...minimalPayload(), paymentNo: 'PAY-DUP-001' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('defaults status to completed when omitted', async () => {
      const res = await request(app).post('/api/v1/payments').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('completed');
    });

    it('defaults paidAt to current date', async () => {
      const res = await request(app).post('/api/v1/payments').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.paidAt).toBeTruthy();
      expect(new Date(res.body.data.paidAt).getTime()).toBeGreaterThan(0);
    });

    it('recalculates Bill status to paid when full amount paid', async () => {
      await request(app).post('/api/v1/payments').send({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('paid');
      expect(updatedBill.paidAt).toBeTruthy();
    });

    it('handles partial payment (Bill stays pending)', async () => {
      await request(app).post('/api/v1/payments').send({
        bill: pendingBill._id.toString(),
        amount: 3000,
        method: 'cash',
      });

      const updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('pending');
      expect(updatedBill.paidAt).toBeNull();
    });

    it('handles multiple payments on same bill', async () => {
      await request(app).post('/api/v1/payments').send({
        bill: pendingBill._id.toString(),
        amount: 3000,
        method: 'cash',
      });

      let updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('pending');

      await request(app).post('/api/v1/payments').send({
        bill: pendingBill._id.toString(),
        amount: 2000,
        method: 'card',
      });

      updatedBill = await Bill.findById(pendingBill._id);
      expect(updatedBill.status).toBe('paid');
    });

    it('recalculates overdue Bill to paid', async () => {
      await request(app).post('/api/v1/payments').send({
        bill: overdueBill._id.toString(),
        amount: 4000,
        method: 'bank_transfer',
      });

      const updatedBill = await Bill.findById(overdueBill._id);
      expect(updatedBill.status).toBe('paid');
    });

    it('rejects missing bill', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ amount: 100, method: 'cash' });

      expect(res.status).toBe(400);
      expect(res.body.errors.bill).toBeTruthy();
    });

    it('rejects invalid bill ID format', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), bill: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.errors.bill).toBeTruthy();
    });

    it('rejects nonexistent bill reference', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), bill: new mongoose.Types.ObjectId().toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/referenced bill does not exist/i);
    });

    it('rejects missing amount', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), method: 'cash' });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects amount of 0', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects negative amount', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), amount: -100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.amount).toBeTruthy();
    });

    it('rejects missing method', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.errors.method).toBeTruthy();
    });

    it('rejects invalid method', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), method: 'bitcoin' });

      expect(res.status).toBe(400);
      expect(res.body.errors.method).toBeTruthy();
    });

    it('rejects invalid status', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('accepts explicit pending status', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), status: 'pending' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
    });

    it('accepts explicit failed status', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), status: 'failed' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('failed');
    });

    it('accepts all valid methods', async () => {
      const methods = ['cash', 'bank_transfer', 'upi', 'card', 'cheque'];

      for (const method of methods) {
        const bill = await Bill.create(billPayload({ period: `Test ${method}` }));
        const res = await request(app)
          .post('/api/v1/payments')
          .send({ bill: bill._id.toString(), amount: 100, method });

        expect(res.status).toBe(201);
        expect(res.body.data.method).toBe(method);
      }
    });

    it('accepts reference and notes', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), reference: 'TXN-12345', notes: 'Paid via app' });

      expect(res.status).toBe(201);
      expect(res.body.data.reference).toBe('TXN-12345');
      expect(res.body.data.notes).toBe('Paid via app');
    });

    it('rejects non-string reference', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ ...validPayload(), reference: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.errors.reference).toBeTruthy();
    });

    it('defaults reference and notes to empty strings', async () => {
      const res = await request(app).post('/api/v1/payments').send(validPayload());

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
      const res = await request(app).get('/api/v1/payments');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].bill.unit.building.name).toBeTruthy();
    });

    it('searches across paymentNo', async () => {
      const payments = await Payment.find().limit(1);
      const searchTerm = payments[0].paymentNo;

      const res = await request(app).get(`/api/v1/payments?search=${searchTerm}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('searches across reference', async () => {
      const res = await request(app).get('/api/v1/payments?search=TXN-001');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('filters by bill ID', async () => {
      const res = await request(app).get(`/api/v1/payments?bill=${pendingBill._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].bill.id).toBe(pendingBill._id.toString());
    });

    it('filters by status', async () => {
      await Payment.create({ bill: pendingBill._id.toString(), amount: 100, method: 'card', status: 'pending' });
      const res = await request(app).get('/api/v1/payments?status=pending');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('pending');
    });

    it('filters by method', async () => {
      const res = await request(app).get('/api/v1/payments?method=cash');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].method).toBe('cash');
    });

    it('filters by dateFrom', async () => {
      const res = await request(app).get('/api/v1/payments?dateFrom=2026-01-12');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('filters by dateTo', async () => {
      const res = await request(app).get('/api/v1/payments?dateTo=2026-01-12');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('returns empty array for invalid status', async () => {
      const res = await request(app).get('/api/v1/payments?status=invalid');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid method', async () => {
      const res = await request(app).get('/api/v1/payments?method=bitcoin');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid bill', async () => {
      const res = await request(app).get('/api/v1/payments?bill=invalid');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array for invalid building', async () => {
      const res = await request(app).get('/api/v1/payments?building=invalid');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('filters by building', async () => {
      const res = await request(app).get(`/api/v1/payments?building=${sampleBuilding._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });
  });

  describe('GET /api/v1/payments/:id', () => {
    it('returns single payment with population', async () => {
      const created = await Payment.create({
        bill: pendingBill._id.toString(),
        amount: 5000,
        method: 'upi',
      });

      const res = await request(app).get(`/api/v1/payments/${created._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.paymentNo).toBe(created.paymentNo);
      expect(res.body.data.bill.unit.unitNumber).toBe('101');
    });

    it('returns 404 for invalid ID format', async () => {
      const res = await request(app).get('/api/v1/payments/invalid');
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Payment not found');
    });

    it('returns 404 for nonexistent ID', async () => {
      const res = await request(app).get(`/api/v1/payments/${new mongoose.Types.ObjectId()}`);
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

      const res = await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ bill: overdueBill._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.errors.bill).toBeTruthy();
    });

    it('recalculates bill to pending when completed→failed', async () => {
      const createRes = await request(app)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 5000, method: 'upi' });
      const created = createRes.body.data;

      const billBefore = await Bill.findById(pendingBill._id);
      expect(billBefore.status).toBe('paid');

      await request(app)
        .patch(`/api/v1/payments/${created.id}`)
        .send({ status: 'failed' });

      const billAfter = await Bill.findById(pendingBill._id);
      expect(billAfter.status).toBe('pending');
      expect(billAfter.paidAt).toBeNull();
    });

    it('recalculates bill to paid when failed→completed', async () => {
      const createRes = await request(app)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 5000, method: 'upi', status: 'failed' });
      const created = createRes.body.data;

      const billBefore = await Bill.findById(pendingBill._id);
      expect(billBefore.status).toBe('pending');

      await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
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

      const res = await request(app)
        .patch(`/api/v1/payments/${created._id}`)
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeTruthy();
    });

    it('returns 404 for nonexistent payment', async () => {
      const res = await request(app)
        .patch(`/api/v1/payments/${new mongoose.Types.ObjectId()}`)
        .send({ amount: 100 });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Payment not found');
    });
  });

  describe('DELETE /api/v1/payments/:id', () => {
    it('hard deletes payment and recalculates bill status', async () => {
      const createRes = await request(app)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 5000, method: 'upi' });
      const created = createRes.body.data;

      const billBefore = await Bill.findById(pendingBill._id);
      expect(billBefore.status).toBe('paid');

      const res = await request(app).delete(`/api/v1/payments/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Payment deleted successfully');
      expect(await Payment.findById(created.id)).toBeNull();

      const billAfter = await Bill.findById(pendingBill._id);
      expect(billAfter.status).toBe('pending');
      expect(billAfter.paidAt).toBeNull();
    });

    it('recalculates bill with multiple payments', async () => {
      const createRes1 = await request(app)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 3000, method: 'cash' });
      const p1 = createRes1.body.data;

      const createRes2 = await request(app)
        .post('/api/v1/payments')
        .send({ bill: pendingBill._id.toString(), amount: 2000, method: 'card' });
      const p2 = createRes2.body.data;

      let bill = await Bill.findById(pendingBill._id);
      expect(bill.status).toBe('paid');

      await request(app).delete(`/api/v1/payments/${p2.id}`);

      bill = await Bill.findById(pendingBill._id);
      expect(bill.status).toBe('pending');
    });

    it('returns 404 for nonexistent payment', async () => {
      const res = await request(app)
        .delete(`/api/v1/payments/${new mongoose.Types.ObjectId()}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Payment not found');
    });
  });
});
