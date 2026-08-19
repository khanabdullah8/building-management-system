process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Resident = require('../src/models/Resident');
const Maintenance = require('../src/models/Maintenance');
const Complaint = require('../src/models/Complaint');
const Bill = require('../src/models/Bill');
const Payment = require('../src/models/Payment');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { createTestAdmin, removeTestAdmin, getAuthToken, authRequest } = require('./helpers/auth');

describe('Dashboard API (/api/v1/dashboard)', () => {
  let authToken;
  let buildingA;
  let buildingB;
  let unit101;
  let unit202;

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
    await Complaint.deleteMany({});
    await Maintenance.deleteMany({});
    await Resident.deleteMany({});
    await Unit.deleteMany({});
    await Building.deleteMany({});

    buildingA = await Building.create({ code: 'BLD-A', name: 'Greenwood Heights' });
    buildingB = await Building.create({ code: 'BLD-B', name: 'Maple Residency' });

    unit101 = await Unit.create({ unitNumber: '101', building: buildingA._id, status: 'occupied' });
    unit202 = await Unit.create({ unitNumber: '202', building: buildingA._id, status: 'vacant' });
  });

  describe('GET /api/v1/dashboard', () => {
    it('returns all KPI fields', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('buildings');
      expect(res.body.data).toHaveProperty('units');
      expect(res.body.data).toHaveProperty('occupied');
      expect(res.body.data).toHaveProperty('vacant');
      expect(res.body.data).toHaveProperty('pendingMaintenance');
      expect(res.body.data).toHaveProperty('openComplaints');
      expect(res.body.data).toHaveProperty('pendingPayments');
      expect(res.body.data).toHaveProperty('monthlyCollection');
      expect(res.body.data).toHaveProperty('recentComplaints');
      expect(res.body.data).toHaveProperty('recentMaintenance');
      expect(res.body.data).toHaveProperty('recentPayments');
    });

    it('returns correct building count', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.buildings).toBe(2);
    });

    it('returns correct unit counts', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.units).toBe(2);
      expect(res.body.data.occupied).toBe(1);
      expect(res.body.data.vacant).toBe(1);
    });

    it('returns correct pending maintenance count', async () => {
      await Maintenance.create({ title: 'AC repair', unit: unit101._id, priority: 'high', status: 'open' });
      await Maintenance.create({ title: 'Plumbing', unit: unit101._id, priority: 'medium', status: 'in-progress' });
      await Maintenance.create({ title: 'Done task', unit: unit101._id, priority: 'low', status: 'completed' });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.pendingMaintenance).toBe(2);
    });

    it('returns correct open complaints count', async () => {
      await Complaint.create({ subject: 'Leak', unit: unit101._id, priority: 'high', status: 'open' });
      await Complaint.create({ subject: 'Noise', unit: unit101._id, priority: 'medium', status: 'in-progress' });
      await Complaint.create({ subject: 'Fixed', unit: unit101._id, priority: 'low', status: 'resolved' });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.openComplaints).toBe(2);
    });

    it('returns correct pending payments (bills) count', async () => {
      const bill1 = await Bill.create({ unit: unit101._id, period: 'Jan 2026', amount: 5000, status: 'pending' });
      const bill2 = await Bill.create({ unit: unit101._id, period: 'Feb 2026', amount: 3000, status: 'overdue' });
      await Bill.create({ unit: unit101._id, period: 'Dec 2025', amount: 4000, status: 'paid', paidAt: new Date() });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.pendingPayments).toBe(2);
    });

    it('returns correct monthly collection from completed payments in current month', async () => {
      const now = new Date();
      const bill1 = await Bill.create({ unit: unit101._id, period: 'Jan 2026', amount: 5000, status: 'paid' });
      const bill2 = await Bill.create({ unit: unit101._id, period: 'Feb 2026', amount: 3000, status: 'pending' });

      await Payment.create({ bill: bill1._id, amount: 5000, method: 'upi', status: 'completed', paidAt: now });
      await Payment.create({ bill: bill2._id, amount: 3000, method: 'cash', status: 'completed', paidAt: now });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.monthlyCollection).toBe(8000);
    });

    it('excludes failed/pending payments from monthly collection', async () => {
      const now = new Date();
      const bill1 = await Bill.create({ unit: unit101._id, period: 'Jan 2026', amount: 5000, status: 'paid' });
      const bill2 = await Bill.create({ unit: unit101._id, period: 'Feb 2026', amount: 3000, status: 'pending' });

      await Payment.create({ bill: bill1._id, amount: 5000, method: 'upi', status: 'completed', paidAt: now });
      await Payment.create({ bill: bill2._id, amount: 3000, method: 'cash', status: 'pending', paidAt: now });
      await Payment.create({ bill: bill1._id, amount: 1000, method: 'card', status: 'failed', paidAt: now });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.monthlyCollection).toBe(5000);
    });

    it('excludes payments from previous months from monthly collection', async () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const bill1 = await Bill.create({ unit: unit101._id, period: 'Jan 2026', amount: 5000, status: 'paid' });

      await Payment.create({ bill: bill1._id, amount: 5000, method: 'upi', status: 'completed', paidAt: lastMonth });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.monthlyCollection).toBe(0);
    });

    it('returns monthlyCollection as 0 when no payments exist', async () => {
      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.monthlyCollection).toBe(0);
    });

    it('returns recent complaints with Unit and Building populated', async () => {
      await Complaint.create({ subject: 'Leak', unit: unit101._id, priority: 'high', status: 'open' });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.recentComplaints.length).toBe(1);
      expect(res.body.data.recentComplaints[0].unit.unitNumber).toBe('101');
      expect(res.body.data.recentComplaints[0].unit.building.name).toBe('Greenwood Heights');
    });

    it('returns at most 5 recent complaints', async () => {
      for (let i = 0; i < 7; i++) {
        await Complaint.create({ subject: `Issue ${i}`, unit: unit101._id, priority: 'low', status: 'open' });
      }

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.recentComplaints.length).toBe(5);
    });

    it('returns recent maintenance with Unit and Building populated', async () => {
      await Maintenance.create({ title: 'AC repair', unit: unit101._id, priority: 'high', status: 'open' });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.recentMaintenance.length).toBe(1);
      expect(res.body.data.recentMaintenance[0].unit.unitNumber).toBe('101');
      expect(res.body.data.recentMaintenance[0].unit.building.name).toBe('Greenwood Heights');
    });

    it('returns at most 5 recent maintenance requests', async () => {
      for (let i = 0; i < 7; i++) {
        await Maintenance.create({ title: `Task ${i}`, unit: unit101._id, priority: 'low', status: 'open' });
      }

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.recentMaintenance.length).toBe(5);
    });

    it('returns recent payments with Bill → Unit → Building populated', async () => {
      const bill = await Bill.create({ unit: unit101._id, period: 'Jan 2026', amount: 5000, status: 'paid' });
      await Payment.create({ bill: bill._id, amount: 5000, method: 'upi', status: 'completed' });

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.recentPayments.length).toBe(1);
      expect(res.body.data.recentPayments[0].bill.unit.unitNumber).toBe('101');
      expect(res.body.data.recentPayments[0].bill.unit.building.name).toBe('Greenwood Heights');
    });

    it('returns at most 5 recent payments', async () => {
      const bill = await Bill.create({ unit: unit101._id, period: 'Jan 2026', amount: 50000, status: 'paid' });
      for (let i = 0; i < 7; i++) {
        await Payment.create({ bill: bill._id, amount: 100, method: 'cash', status: 'completed' });
      }

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');
      expect(res.body.data.recentPayments.length).toBe(5);
    });

    it('returns empty arrays and zero counts when database is empty', async () => {
      await Building.deleteMany({});
      await Unit.deleteMany({});

      const res = await authRequest(app, authToken).get('/api/v1/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.data.buildings).toBe(0);
      expect(res.body.data.units).toBe(0);
      expect(res.body.data.occupied).toBe(0);
      expect(res.body.data.vacant).toBe(0);
      expect(res.body.data.pendingMaintenance).toBe(0);
      expect(res.body.data.openComplaints).toBe(0);
      expect(res.body.data.pendingPayments).toBe(0);
      expect(res.body.data.monthlyCollection).toBe(0);
      expect(res.body.data.recentComplaints).toEqual([]);
      expect(res.body.data.recentMaintenance).toEqual([]);
      expect(res.body.data.recentPayments).toEqual([]);
    });
  });
});
