process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Resident = require('../src/models/Resident');
const Bill = require('../src/models/Bill');
const Payment = require('../src/models/Payment');
const Complaint = require('../src/models/Complaint');
const Maintenance = require('../src/models/Maintenance');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');

/**
 * Phase 42 — Dashboard scope isolation and empty building scopes.
 *
 * Proves that the dashboard aggregates are restricted to the caller's resolved
 * scope (resident own unit, staff assigned buildings, admin global) and that an
 * empty resolved scope (staff with no buildings, resident without a valid
 * resident -> unit -> building link) behaves as "no access" rather than
 * silently degrading to global access.
 */
const EMAIL_SUFFIX = '@phase42.test.local';

describe('Phase 42: dashboard scope isolation and empty building scopes', () => {
  let adminUser;
  let staffA;
  let staffEmpty;
  let residentUser;
  let residentUnlinked;
  let buildingA;
  let buildingB;
  let unitA1;
  let unitA2;
  let unitB1;

  const asUser = (user) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${getAuthToken(user)}`),
  });

  beforeAll(async () => {
    await startMemoryDb();
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await Promise.all([
      Payment.deleteMany({}),
      Bill.deleteMany({}),
      Complaint.deleteMany({}),
      Maintenance.deleteMany({}),
      Resident.deleteMany({}),
      Unit.deleteMany({}),
      Building.deleteMany({}),
      User.deleteMany({ email: { $regex: /@phase42\.test\.local$/ } }),
    ]);

    buildingA = await Building.create({ code: 'P42-A', name: 'Phase42 Building A' });
    buildingB = await Building.create({ code: 'P42-B', name: 'Phase42 Building B' });

    unitA1 = await Unit.create({ unitNumber: 'P42-A1', building: buildingA._id, status: 'occupied' });
    unitA2 = await Unit.create({ unitNumber: 'P42-A2', building: buildingA._id, status: 'vacant' });
    unitB1 = await Unit.create({ unitNumber: 'P42-B1', building: buildingB._id, status: 'occupied' });

    const residentA = await Resident.create({
      name: 'Phase42 Resident A',
      unit: unitA1._id,
      phone: '100',
      type: 'owner',
      status: 'active',
    });

    adminUser = await User.create({ name: 'P42 Admin', email: `p42-admin${EMAIL_SUFFIX}`, password: 'password123', role: 'admin', status: 'active' });
    staffA = await User.create({ name: 'P42 Staff A', email: `p42-staff-a${EMAIL_SUFFIX}`, password: 'password123', role: 'staff', status: 'active', buildings: [buildingA._id] });
    staffEmpty = await User.create({ name: 'P42 Staff Empty', email: `p42-staff-empty${EMAIL_SUFFIX}`, password: 'password123', role: 'staff', status: 'active', buildings: [] });
    residentUser = await User.create({ name: 'P42 Resident User', email: `p42-resident${EMAIL_SUFFIX}`, password: 'password123', role: 'resident', status: 'active', resident: residentA._id });
    residentUnlinked = await User.create({ name: 'P42 Resident Unlinked', email: `p42-resident-unlinked${EMAIL_SUFFIX}`, password: 'password123', role: 'resident', status: 'active', resident: null });
  });

  const seedScopedData = async () => {
    const now = new Date();

    const billA1 = await Bill.create({ unit: unitA1._id, period: 'P42-A-paid', amount: 5000, status: 'paid' });
    const billA2 = await Bill.create({ unit: unitA2._id, period: 'P42-A-overdue', amount: 3000, status: 'overdue' });
    const billA3 = await Bill.create({ unit: unitA1._id, period: 'P42-A-pending', amount: 1000, status: 'pending' });
    const billB1 = await Bill.create({ unit: unitB1._id, period: 'P42-B-paid', amount: 7000, status: 'paid' });
    const billB2 = await Bill.create({ unit: unitB1._id, period: 'P42-B-pending', amount: 2000, status: 'pending' });

    const paymentA1 = await Payment.create({ bill: billA1._id, amount: 5000, method: 'upi', status: 'completed', paidAt: now });
    const paymentB1 = await Payment.create({ bill: billB1._id, amount: 7000, method: 'cash', status: 'completed', paidAt: now });

    await Complaint.create({ subject: 'A leak', unit: unitA1._id, priority: 'high', status: 'open' });
    await Complaint.create({ subject: 'B noise', unit: unitB1._id, priority: 'high', status: 'open' });

    await Maintenance.create({ title: 'A repair', unit: unitA1._id, priority: 'high', status: 'open' });
    await Maintenance.create({ title: 'B repair', unit: unitB1._id, priority: 'high', status: 'open' });

    return { billA1, billA2, billA3, billB1, billB2, paymentA1, paymentB1 };
  };

  describe('Dashboard scope isolation', () => {
    it('restricts the resident dashboard to the resident own unit and building', async () => {
      await seedScopedData();

      const res = await asUser(residentUser).get('/api/v1/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.data.buildings).toBe(1);
      expect(res.body.data.units).toBe(1);
      expect(res.body.data.occupied).toBe(1);
      expect(res.body.data.vacant).toBe(0);
      expect(res.body.data.pendingMaintenance).toBe(1);
      expect(res.body.data.openComplaints).toBe(1);
      expect(res.body.data.pendingPayments).toBe(1);

      expect(res.body.data.recentComplaints).toHaveLength(1);
      expect(res.body.data.recentComplaints[0].subject).toBe('A leak');
      expect(res.body.data.recentComplaints[0].unit.building.name).toBe('Phase42 Building A');

      expect(res.body.data.recentMaintenance).toHaveLength(1);
      expect(res.body.data.recentMaintenance[0].title).toBe('A repair');

      expect(res.body.data.recentPayments).toHaveLength(1);
      expect(res.body.data.recentPayments[0].amount).toBe(5000);
      expect(res.body.data.recentPayments[0].bill.unit.building.name).toBe('Phase42 Building A');

      const subjects = res.body.data.recentComplaints.map((c) => c.subject);
      expect(subjects).not.toContain('B noise');
    });

    it('excludes payments from other buildings from the resident monthly collection', async () => {
      await seedScopedData();

      const residentRes = await asUser(residentUser).get('/api/v1/dashboard');
      expect(residentRes.body.data.monthlyCollection).toBe(5000);

      // The 7000 payment in building B exists and is visible to admin, proving
      // the resident total is a scope filter rather than missing data.
      const adminRes = await asUser(adminUser).get('/api/v1/dashboard');
      expect(adminRes.body.data.monthlyCollection).toBe(12000);
    });

    it('excludes unassigned buildings from the staff dashboard', async () => {
      await seedScopedData();

      const res = await asUser(staffA).get('/api/v1/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.data.buildings).toBe(1);
      expect(res.body.data.units).toBe(2);
      expect(res.body.data.occupied).toBe(1);
      expect(res.body.data.vacant).toBe(1);
      expect(res.body.data.pendingMaintenance).toBe(1);
      expect(res.body.data.openComplaints).toBe(1);
      expect(res.body.data.pendingPayments).toBe(2);
      expect(res.body.data.monthlyCollection).toBe(5000);

      expect(res.body.data.recentComplaints).toHaveLength(1);
      expect(res.body.data.recentComplaints[0].subject).toBe('A leak');
      expect(res.body.data.recentMaintenance).toHaveLength(1);
      expect(res.body.data.recentMaintenance[0].title).toBe('A repair');
      expect(res.body.data.recentPayments).toHaveLength(1);
      expect(res.body.data.recentPayments[0].bill.unit.building.name).toBe('Phase42 Building A');
    });

    it('leaves the admin dashboard global and unchanged', async () => {
      await seedScopedData();

      const res = await asUser(adminUser).get('/api/v1/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.data.buildings).toBe(2);
      expect(res.body.data.units).toBe(3);
      expect(res.body.data.occupied).toBe(2);
      expect(res.body.data.vacant).toBe(1);
      expect(res.body.data.pendingMaintenance).toBe(2);
      expect(res.body.data.openComplaints).toBe(2);
      expect(res.body.data.pendingPayments).toBe(3);
      expect(res.body.data.monthlyCollection).toBe(12000);
      expect(res.body.data.recentComplaints).toHaveLength(2);
      expect(res.body.data.recentPayments).toHaveLength(2);
    });

    it('keeps the dashboard response shape compatible for every role', async () => {
      await seedScopedData();

      const shape = [
        'buildings',
        'units',
        'occupied',
        'vacant',
        'pendingMaintenance',
        'openComplaints',
        'pendingPayments',
        'monthlyCollection',
        'recentComplaints',
        'recentMaintenance',
        'recentPayments',
      ];

      for (const user of [adminUser, staffA, residentUser]) {
        const res = await asUser(user).get('/api/v1/dashboard');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        for (const key of shape) {
          expect(res.body.data).toHaveProperty(key);
        }
        expect(Array.isArray(res.body.data.recentComplaints)).toBe(true);
        expect(Array.isArray(res.body.data.recentMaintenance)).toBe(true);
        expect(Array.isArray(res.body.data.recentPayments)).toBe(true);
      }
    });
  });

  describe('Empty building scope does not become global access', () => {
    it('treats a staff member with no assigned buildings as no access', async () => {
      const seeded = await seedScopedData();

      // Global admin can see the data, so empty results below are not "no data".
      const adminBuildings = await asUser(adminUser).get('/api/v1/buildings');
      expect(adminBuildings.body.data.length).toBe(2);

      const buildings = await asUser(staffEmpty).get('/api/v1/buildings');
      expect(buildings.status).toBe(200);
      expect(buildings.body.data).toEqual([]);

      const units = await asUser(staffEmpty).get('/api/v1/units');
      expect(units.status).toBe(200);
      expect(units.body.data).toEqual([]);

      const billing = await asUser(staffEmpty).get('/api/v1/billing');
      expect(billing.status).toBe(200);
      expect(billing.body.data).toEqual([]);

      const payments = await asUser(staffEmpty).get('/api/v1/payments');
      expect(payments.status).toBe(200);
      expect(payments.body.data).toEqual([]);

      const buildingDetail = await asUser(staffEmpty).get(`/api/v1/buildings/${buildingA._id}`);
      expect(buildingDetail.status).toBe(403);

      const unitDetail = await asUser(staffEmpty).get(`/api/v1/units/${unitA1._id}`);
      expect(unitDetail.status).toBe(403);

      const billDetail = await asUser(staffEmpty).get(`/api/v1/billing/${seeded.billA1._id}`);
      expect(billDetail.status).toBe(403);

      const paymentDetail = await asUser(staffEmpty).get(`/api/v1/payments/${seeded.paymentA1._id}`);
      expect(paymentDetail.status).toBe(403);

      const dashboard = await asUser(staffEmpty).get('/api/v1/dashboard');
      expect(dashboard.status).toBe(200);
      expect(dashboard.body.data.buildings).toBe(0);
      expect(dashboard.body.data.units).toBe(0);
      expect(dashboard.body.data.monthlyCollection).toBe(0);
      expect(dashboard.body.data.recentPayments).toEqual([]);
    });

    it('treats a resident without a resident -> unit -> building link as no access', async () => {
      await seedScopedData();

      // Global admin can see the units, so empty results are not "no data".
      const adminUnits = await asUser(adminUser).get('/api/v1/units');
      expect(adminUnits.body.data.length).toBeGreaterThanOrEqual(3);

      const buildings = await asUser(residentUnlinked).get('/api/v1/buildings');
      expect(buildings.status).toBe(200);
      expect(buildings.body.data).toEqual([]);

      const units = await asUser(residentUnlinked).get('/api/v1/units');
      expect(units.status).toBe(200);
      expect(units.body.data).toEqual([]);

      const billing = await asUser(residentUnlinked).get('/api/v1/billing');
      expect(billing.status).toBe(200);
      expect(billing.body.data).toEqual([]);

      const payments = await asUser(residentUnlinked).get('/api/v1/payments');
      expect(payments.status).toBe(200);
      expect(payments.body.data).toEqual([]);

      const buildingDetail = await asUser(residentUnlinked).get(`/api/v1/buildings/${buildingA._id}`);
      expect(buildingDetail.status).toBe(403);

      const unitDetail = await asUser(residentUnlinked).get(`/api/v1/units/${unitA1._id}`);
      expect(unitDetail.status).toBe(403);

      const dashboard = await asUser(residentUnlinked).get('/api/v1/dashboard');
      expect(dashboard.status).toBe(200);
      expect(dashboard.body.data.buildings).toBe(0);
      expect(dashboard.body.data.units).toBe(0);
      expect(dashboard.body.data.monthlyCollection).toBe(0);
      expect(dashboard.body.data.recentComplaints).toEqual([]);
    });
  });
});
