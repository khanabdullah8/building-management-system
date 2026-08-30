process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Resident = require('../src/models/Resident');
const Maintenance = require('../src/models/Maintenance');
const Complaint = require('../src/models/Complaint');
const Notice = require('../src/models/Notice');
const Parking = require('../src/models/Parking');
const Bill = require('../src/models/Bill');
const Payment = require('../src/models/Payment');
const Visitor = require('../src/models/Visitor');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');

/**
 * Phase 25 — Backend RBAC Hardening regression tests.
 *
 * Verifies that residents are forbidden from privileged write operations
 * while admin/staff retain full scope-guarded access, and that legitimate
 * resident workflows (create maintenance/complaint/visitor/payment for their
 * own unit) remain intact. Forbidden mutations also assert the DB is unchanged.
 */
describe('Phase 25: Backend RBAC Hardening', () => {
  let adminUser, staffUser, residentUser;
  let buildingA, buildingB;
  let unitA1, unitB1;
  let residentOwn, residentOther;

  const buildAuth = (user) => {
    const token = `Bearer ${getAuthToken(user)}`;
    const agent = request(app);
    const setAuth = (req) => req.set('Authorization', token);
    return {
      get: (url) => setAuth(agent.get(url)),
      post: (url) => setAuth(agent.post(url)),
      patch: (url) => setAuth(agent.patch(url)),
      put: (url) => setAuth(agent.put(url)),
      delete: (url) => setAuth(agent.delete(url)),
    };
  };
  const auth = (user) => buildAuth(user);

  beforeAll(async () => {
    await startMemoryDb();

    adminUser = await User.create({
      name: 'Rbac Admin',
      email: 'rbac-admin@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });

    staffUser = await User.create({
      name: 'Rbac Staff',
      email: 'rbac-staff@test.local',
      password: 'password123',
      role: 'staff',
      status: 'active',
    });

    buildingA = await Building.create({ code: 'RBACA', name: 'Rbac Building A', address: 'A st', units: 2 });
    buildingB = await Building.create({ code: 'RBACB', name: 'Rbac Building B', address: 'B st', units: 2 });

    unitA1 = await Unit.create({ unitNumber: 'RBA-101', building: buildingA._id, type: '2BHK', floor: 1, status: 'occupied' });
    unitB1 = await Unit.create({ unitNumber: 'RBB-101', building: buildingB._id, type: '2BHK', floor: 1, status: 'occupied' });

    residentOwn = await Resident.create({ name: 'Own Resident', unit: unitA1._id, phone: '111', type: 'owner', status: 'active' });
    residentOther = await Resident.create({ name: 'Other Unit Resident', unit: unitB1._id, phone: '222', type: 'owner', status: 'active' });

    residentUser = await User.create({
      name: 'Rbac Resident',
      email: 'rbac-resident@test.local',
      password: 'password123',
      role: 'resident',
      status: 'active',
      resident: residentOwn._id,
    });

    staffUser.buildings = [buildingA._id];
    await staffUser.save();
  });

  afterAll(async () => {
    await Payment.deleteMany({});
    await Bill.deleteMany({});
    await Parking.deleteMany({});
    await Notice.deleteMany({});
    await Complaint.deleteMany({});
    await Maintenance.deleteMany({});
    await Resident.deleteMany({ _id: { $in: [residentOwn._id, residentOther._id] } });
    await Unit.deleteMany({ _id: { $in: [unitA1._id, unitB1._id] } });
    await Building.deleteMany({ _id: { $in: [buildingA._id, buildingB._id] } });
    await User.deleteMany({});
    await stopMemoryDb();
  });

  describe('PARKING: residents cannot create/update/delete', () => {
    let slot;
    beforeAll(async () => {
      slot = await Parking.create({ slotCode: 'RBAC-P1', building: buildingA._id, unit: unitA1._id, vehicleType: 'car', vehicleNumber: 'AB123' });
    });
    afterAll(async () => {
      await Parking.deleteMany({ _id: slot._id });
    });

    it('resident cannot create a parking slot (403) and DB is unchanged', async () => {
      const before = await Parking.countDocuments({ building: buildingA._id });
      const res = await auth(residentUser)
        .post('/api/v1/parking')
        .send({ slotCode: 'RBAC-P2', building: buildingA._id.toString(), unit: unitA1._id.toString() });
      expect(res.status).toBe(403);
      expect(await Parking.countDocuments({ building: buildingA._id })).toBe(before);
    });

    it('resident cannot update a parking slot (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/parking/${slot._id}`)
        .send({ vehicleNumber: 'HACKED' });
      expect(res.status).toBe(403);
      const reloaded = await Parking.findById(slot._id);
      expect(reloaded.vehicleNumber).toBe('AB123');
    });

    it('resident cannot delete a parking slot (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .delete(`/api/v1/parking/${slot._id}`);
      expect(res.status).toBe(403);
      expect(await Parking.findById(slot._id)).not.toBeNull();
    });

    it('admin can create/update/delete a parking slot', async () => {
      const created = await auth(adminUser)
        .post('/api/v1/parking')
        .send({ slotCode: 'RBAC-ADM', building: buildingA._id.toString(), unit: unitA1._id.toString() });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      const updated = await auth(adminUser).patch(`/api/v1/parking/${id}`).send({ vehicleType: 'bike' });
      expect(updated.status).toBe(200);
      const deleted = await auth(adminUser).delete(`/api/v1/parking/${id}`);
      expect(deleted.status).toBe(200);
    });

    it('staff can create a parking slot in assigned building', async () => {
      const res = await auth(staffUser)
        .post('/api/v1/parking')
        .send({ slotCode: 'RBAC-STAFF', building: buildingA._id.toString(), unit: unitA1._id.toString() });
      expect(res.status).toBe(201);
      await Parking.findByIdAndDelete(res.body.data.id);
    });

    it('resident can still read parking slots', async () => {
      const res = await auth(residentUser).get('/api/v1/parking');
      expect(res.status).toBe(200);
    });
  });

  describe('NOTICES: residents cannot create/update/delete', () => {
    let notice;
    beforeAll(async () => {
      notice = await Notice.create({ title: 'Rbac Notice', category: 'notice', building: buildingA._id });
    });
    afterAll(async () => {
      await Notice.deleteMany({ _id: notice._id });
    });

    it('resident cannot create a notice (403) and DB is unchanged', async () => {
      const before = await Notice.countDocuments({});
      const res = await auth(residentUser)
        .post('/api/v1/notices')
        .send({ title: 'Resident Notice', category: 'notice', building: buildingA._id.toString() });
      expect(res.status).toBe(403);
      expect(await Notice.countDocuments({})).toBe(before);
    });

    it('resident cannot update a notice (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/notices/${notice._id}`)
        .send({ title: 'Hacked Notice' });
      expect(res.status).toBe(403);
      const reloaded = await Notice.findById(notice._id);
      expect(reloaded.title).toBe('Rbac Notice');
    });

    it('resident cannot delete a notice (403) and DB is unchanged', async () => {
      const res = await auth(residentUser).delete(`/api/v1/notices/${notice._id}`);
      expect(res.status).toBe(403);
      expect(await Notice.findById(notice._id)).not.toBeNull();
    });

    it('admin can create/update/delete a notice', async () => {
      const created = await auth(adminUser)
        .post('/api/v1/notices')
        .send({ title: 'Admin Notice', category: 'announcement', building: buildingA._id.toString() });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      const updated = await auth(adminUser).patch(`/api/v1/notices/${id}`).send({ title: 'Updated' });
      expect(updated.status).toBe(200);
      const deleted = await auth(adminUser).delete(`/api/v1/notices/${id}`);
      expect(deleted.status).toBe(200);
    });

    it('staff can create a notice in assigned building', async () => {
      const res = await auth(staffUser)
        .post('/api/v1/notices')
        .send({ title: 'Staff Notice', category: 'notice', building: buildingA._id.toString() });
      expect(res.status).toBe(201);
      await Notice.findByIdAndDelete(res.body.data.id);
    });

    it('resident can still read notices', async () => {
      const res = await auth(residentUser).get('/api/v1/notices');
      expect(res.status).toBe(200);
    });
  });

  describe('BILLING: residents cannot create/update/delete', () => {
    let bill;
    beforeAll(async () => {
      bill = await Bill.create({ unit: unitA1._id, period: '2026-01', amount: 500, status: 'pending' });
    });
    afterAll(async () => {
      await Bill.deleteMany({ _id: bill._id });
    });

    it('resident cannot create a bill (403) and DB is unchanged', async () => {
      const before = await Bill.countDocuments({});
      const res = await auth(residentUser)
        .post('/api/v1/billing')
        .send({ unit: unitA1._id.toString(), period: '2026-02', amount: 100 });
      expect(res.status).toBe(403);
      expect(await Bill.countDocuments({})).toBe(before);
    });

    it('resident cannot update a bill (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/billing/${bill._id}`)
        .send({ amount: 99999 });
      expect(res.status).toBe(403);
      const reloaded = await Bill.findById(bill._id);
      expect(reloaded.amount).toBe(500);
    });

    it('resident cannot delete a bill (403) and DB is unchanged', async () => {
      const res = await auth(residentUser).delete(`/api/v1/billing/${bill._id}`);
      expect(res.status).toBe(403);
      expect(await Bill.findById(bill._id)).not.toBeNull();
    });

    it('admin can create/update/delete a bill', async () => {
      const created = await auth(adminUser)
        .post('/api/v1/billing')
        .send({ unit: unitA1._id.toString(), period: '2026-03', amount: 250 });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      const updated = await auth(adminUser).patch(`/api/v1/billing/${id}`).send({ amount: 300 });
      expect(updated.status).toBe(200);
      const deleted = await auth(adminUser).delete(`/api/v1/billing/${id}`);
      expect(deleted.status).toBe(200);
    });

    it('resident can still read own-unit bills', async () => {
      const res = await auth(residentUser).get('/api/v1/billing');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((b) => b.id || b._id);
      expect(ids).toContain(bill._id.toString());
    });
  });

  describe('PAYMENTS: residents cannot modify/delete', () => {
    let bill, payment;
    beforeAll(async () => {
      bill = await Bill.create({ unit: unitA1._id, period: '2026-04', amount: 500, status: 'pending' });
      payment = await Payment.create({ bill: bill._id, amount: 500, method: 'cash', status: 'completed' });
    });
    afterAll(async () => {
      await Payment.deleteMany({ _id: payment._id });
      await Bill.deleteMany({ _id: bill._id });
    });

    it('resident cannot update a payment (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/payments/${payment._id}`)
        .send({ notes: 'hacked' });
      expect(res.status).toBe(403);
      const reloaded = await Payment.findById(payment._id);
      expect(reloaded.notes).toBe('');
    });

    it('resident cannot delete a payment (403) and bill status is unchanged', async () => {
      const res = await auth(residentUser).delete(`/api/v1/payments/${payment._id}`);
      expect(res.status).toBe(403);
      expect(await Payment.findById(payment._id)).not.toBeNull();
      const reloadedBill = await Bill.findById(bill._id);
      expect(reloadedBill.status).toBe('pending');
    });

    it('admin can update and delete a payment', async () => {
      const updated = await auth(adminUser).patch(`/api/v1/payments/${payment._id}`).send({ notes: 'ok' });
      expect(updated.status).toBe(200);
      const deleted = await auth(adminUser).delete(`/api/v1/payments/${payment._id}`);
      expect(deleted.status).toBe(200);
      // restore for downstream / re-create a payment so the bill stays paid
      await Bill.findByIdAndUpdate(bill._id, { status: 'paid', paidAt: new Date() });
    });

    it('resident can still create a payment for their own bill', async () => {
      const created = await auth(residentUser)
        .post('/api/v1/payments')
        .send({ bill: bill._id.toString(), amount: 100, method: 'cash' });
      expect(created.status).toBe(201);
      await Payment.findByIdAndDelete(created.body.data.id);
    });
  });

  describe('RESIDENT CRUD: residents cannot update/delete cross-unit residents', () => {
    it('resident cannot update a resident in another unit (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/residents/${residentOther._id}`)
        .send({ name: 'Hacked' });
      expect(res.status).toBe(403);
      const reloaded = await Resident.findById(residentOther._id);
      expect(reloaded.name).toBe('Other Unit Resident');
    });

    it('resident cannot delete a resident in another unit (403) and DB is unchanged', async () => {
      const res = await auth(residentUser).delete(`/api/v1/residents/${residentOther._id}`);
      expect(res.status).toBe(403);
      expect(await Resident.findById(residentOther._id)).not.toBeNull();
    });

    it('admin can update and delete a resident (and recreate)', async () => {
      const updated = await auth(adminUser)
        .patch(`/api/v1/residents/${residentOwn._id}`)
        .send({ name: 'Own Resident Updated' });
      expect(updated.status).toBe(200);

      const recreated = await Resident.create({ name: 'Other Unit Resident', unit: unitB1._id, phone: '222', type: 'owner', status: 'active' });
      const deleted = await auth(adminUser).delete(`/api/v1/residents/${recreated._id}`);
      expect(deleted.status).toBe(200);
    });
  });

  describe('Phase 29 M-1: same-unit ownership for residents/visitors', () => {
    let coResidentUser;
    let residentCo;
    let coCreatedVisitor, coCreatedResident;
    let legacyResident, legacyVisitor;

    beforeAll(async () => {
      // A co-inhabitant in the SAME unit as residentUser (both scoped to unitA1).
      residentCo = await Resident.create({ name: 'Co Resident', unit: unitA1._id, phone: '333', type: 'tenant', status: 'active' });
      coResidentUser = await User.create({
        name: 'Co Resident User',
        email: 'rbac-co-resident@test.local',
        password: 'password123',
        role: 'resident',
        status: 'active',
        resident: residentCo._id,
      });

      // Records the co-inhabitant creates are attributed to them via createdBy.
      const vis = await auth(coResidentUser)
        .post('/api/v1/visitors')
        .send({ name: 'Co visitor', unit: unitA1._id.toString(), purpose: 'Delivery' });
      coCreatedVisitor = vis.body.data.id;

      const res = await auth(coResidentUser)
        .post('/api/v1/residents')
        .send({ name: 'Co resident rec', unit: unitA1._id.toString(), phone: '444', type: 'tenant', status: 'active' });
      coCreatedResident = res.body.data.id;

      // Legacy records created directly (no createdBy) in the same unit.
      legacyResident = await Resident.create({ name: 'Legacy Resident', unit: unitA1._id, phone: '555', type: 'tenant', status: 'active' });
      legacyVisitor = await Visitor.create({ name: 'Legacy Visitor', unit: unitA1._id, purpose: 'Guest' });
    });

    afterAll(async () => {
      await Visitor.deleteMany({ _id: { $in: [coCreatedVisitor, legacyVisitor] } });
      await Resident.deleteMany({ _id: { $in: [coCreatedResident, legacyResident, residentCo._id] } });
      await User.deleteMany({ _id: coResidentUser._id });
    });

    it('(a) resident cannot update a resident a co-inhabitant created in the same unit (403)', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/residents/${coCreatedResident}`)
        .send({ name: 'Hacked co resident' });
      expect(res.status).toBe(403);
    });

    it('(b) resident cannot delete a resident a co-inhabitant created in the same unit (403)', async () => {
      const res = await auth(residentUser).delete(`/api/v1/residents/${coCreatedResident}`);
      expect(res.status).toBe(403);
      expect(await Resident.findById(coCreatedResident)).not.toBeNull();
    });

    it('(c) resident cannot update a visitor a co-inhabitant created in the same unit (403)', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/visitors/${coCreatedVisitor}`)
        .send({ name: 'Hacked co visitor' });
      expect(res.status).toBe(403);
    });

    it('(d) resident cannot delete a visitor a co-inhabitant created in the same unit (403)', async () => {
      const res = await auth(residentUser).delete(`/api/v1/visitors/${coCreatedVisitor}`);
      expect(res.status).toBe(403);
      expect(await Visitor.findById(coCreatedVisitor)).not.toBeNull();
    });

    it('(legacy) resident cannot manage a same-unit record with no createdBy (403)', async () => {
      const upd = await auth(residentUser)
        .patch(`/api/v1/residents/${legacyResident._id}`)
        .send({ name: 'Hacked legacy' });
      expect(upd.status).toBe(403);
      const del = await auth(residentUser).delete(`/api/v1/residents/${legacyResident._id}`);
      expect(del.status).toBe(403);
    });

    it('(legacy) resident cannot manage a same-unit visitor with no createdBy (403)', async () => {
      const upd = await auth(residentUser)
        .patch(`/api/v1/visitors/${legacyVisitor._id}`)
        .send({ name: 'Hacked legacy v' });
      expect(upd.status).toBe(403);
      const del = await auth(residentUser).delete(`/api/v1/visitors/${legacyVisitor._id}`);
      expect(del.status).toBe(403);
    });

    it('(e) resident can create and then update/delete their own visitor in their unit', async () => {
      const created = await auth(residentUser)
        .post('/api/v1/visitors')
        .send({ name: 'Own visitor M1', unit: unitA1._id.toString(), purpose: 'Delivery' });
      expect(created.status).toBe(201);
      const ownVisitor = created.body.data.id;
      expect(created.body.data.createdBy).toBe(residentUser.id);

      const upd = await auth(residentUser)
        .patch(`/api/v1/visitors/${ownVisitor}`)
        .send({ name: 'Own visitor M1 updated' });
      expect(upd.status).toBe(200);

      const del = await auth(residentUser).delete(`/api/v1/visitors/${ownVisitor}`);
      expect(del.status).toBe(200);
    });

    it('(e2) resident can create and then update/delete their own resident record', async () => {
      const created = await auth(residentUser)
        .post('/api/v1/residents')
        .send({ name: 'Own resident M1', unit: unitA1._id.toString(), phone: '666', type: 'tenant', status: 'active' });
      expect(created.status).toBe(201);
      const ownResident = created.body.data.id;

      const upd = await auth(residentUser)
        .patch(`/api/v1/residents/${ownResident}`)
        .send({ name: 'Own resident M1 updated' });
      expect(upd.status).toBe(200);

      const del = await auth(residentUser).delete(`/api/v1/residents/${ownResident}`);
      expect(del.status).toBe(200);
    });

    it('(f) admin can update and delete a co-inhabitant-created same-unit resident', async () => {
      const upd = await auth(adminUser)
        .patch(`/api/v1/residents/${coCreatedResident}`)
        .send({ name: 'Admin edit co resident' });
      expect(upd.status).toBe(200);

      const del = await auth(adminUser).delete(`/api/v1/residents/${coCreatedResident}`);
      expect(del.status).toBe(200);
    });

    it('(g) staff can manage a legacy same-unit resident with no createdBy', async () => {
      const upd = await auth(staffUser)
        .patch(`/api/v1/residents/${legacyResident._id}`)
        .send({ name: 'Staff edit legacy' });
      expect(upd.status).toBe(200);

      const del = await auth(staffUser).delete(`/api/v1/residents/${legacyResident._id}`);
      expect(del.status).toBe(200);
    });

    it('(g2) admin can manage a legacy same-unit visitor with no createdBy', async () => {
      const upd = await auth(adminUser)
        .patch(`/api/v1/visitors/${legacyVisitor._id}`)
        .send({ name: 'Admin edit legacy v' });
      expect(upd.status).toBe(200);

      const del = await auth(adminUser).delete(`/api/v1/visitors/${legacyVisitor._id}`);
      expect(del.status).toBe(200);
    });
  });

  describe('MAINTENANCE: residents can create but not update/delete', () => {
    let maint;
    beforeAll(async () => {
      maint = await Maintenance.create({ title: 'Own maint', unit: unitA1._id, priority: 'medium', status: 'open' });
    });
    afterAll(async () => {
      await Maintenance.deleteMany({ _id: maint._id });
    });

    it('resident can create a maintenance request for their own unit', async () => {
      const res = await auth(residentUser)
        .post('/api/v1/maintenance')
        .send({ title: 'New request', unit: unitA1._id.toString(), priority: 'high', status: 'open' });
      expect(res.status).toBe(201);
      await Maintenance.findByIdAndDelete(res.body.data.id);
    });

    it('resident cannot update status of a maintenance request (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/maintenance/${maint._id}`)
        .send({ status: 'completed' });
      expect(res.status).toBe(403);
      const reloaded = await Maintenance.findById(maint._id);
      expect(reloaded.status).toBe('open');
    });

    it('resident cannot delete a maintenance request (403) and DB is unchanged', async () => {
      const res = await auth(residentUser).delete(`/api/v1/maintenance/${maint._id}`);
      expect(res.status).toBe(403);
      expect(await Maintenance.findById(maint._id)).not.toBeNull();
    });

    it('admin can update and delete a maintenance request', async () => {
      const updated = await auth(adminUser)
        .patch(`/api/v1/maintenance/${maint._id}`)
        .send({ status: 'in-progress' });
      expect(updated.status).toBe(200);
      const deleted = await auth(adminUser).delete(`/api/v1/maintenance/${maint._id}`);
      expect(deleted.status).toBe(200);
      await Maintenance.deleteMany({ _id: maint._id });
    });
  });

  describe('COMPLAINTS: residents cannot modify/delete common-area or cross-unit', () => {
    let ownComplaint, commonComplaint, crossUnitComplaint;
    beforeAll(async () => {
      ownComplaint = await Complaint.create({ subject: 'Own complaint', unit: unitA1._id, building: buildingA._id, priority: 'medium', status: 'open' });
      commonComplaint = await Complaint.create({ subject: 'Common area', unit: null, building: buildingA._id, location: 'Lobby', priority: 'low', status: 'open' });
      crossUnitComplaint = await Complaint.create({ subject: 'Cross unit', unit: unitB1._id, building: buildingB._id, priority: 'low', status: 'open' });
    });
    afterAll(async () => {
      await Complaint.deleteMany({ _id: { $in: [ownComplaint._id, commonComplaint._id, crossUnitComplaint._id] } });
    });

    it('resident cannot update a common-area complaint (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/complaints/${commonComplaint._id}`)
        .send({ subject: 'Hacked' });
      expect(res.status).toBe(403);
      const reloaded = await Complaint.findById(commonComplaint._id);
      expect(reloaded.subject).toBe('Common area');
    });

    it('resident cannot delete a common-area complaint (403) and DB is unchanged', async () => {
      const res = await auth(residentUser).delete(`/api/v1/complaints/${commonComplaint._id}`);
      expect(res.status).toBe(403);
      expect(await Complaint.findById(commonComplaint._id)).not.toBeNull();
    });

    it('resident cannot update a cross-unit complaint (403) and DB is unchanged', async () => {
      const res = await auth(residentUser)
        .patch(`/api/v1/complaints/${crossUnitComplaint._id}`)
        .send({ subject: 'Hacked' });
      expect(res.status).toBe(403);
      const reloaded = await Complaint.findById(crossUnitComplaint._id);
      expect(reloaded.subject).toBe('Cross unit');
    });

    it('resident cannot delete a cross-unit complaint (403) and DB is unchanged', async () => {
      const res = await auth(residentUser).delete(`/api/v1/complaints/${crossUnitComplaint._id}`);
      expect(res.status).toBe(403);
      expect(await Complaint.findById(crossUnitComplaint._id)).not.toBeNull();
    });

    it('resident can create a complaint for their own unit', async () => {
      const res = await auth(residentUser)
        .post('/api/v1/complaints')
        .send({ subject: 'My new complaint', unit: unitA1._id.toString(), priority: 'high', status: 'open' });
      expect(res.status).toBe(201);
      await Complaint.findByIdAndDelete(res.body.data.id);
    });

    it('admin can update a common-area complaint and delete a complaint', async () => {
      const updated = await auth(adminUser)
        .patch(`/api/v1/complaints/${commonComplaint._id}`)
        .send({ subject: 'Admin updated' });
      expect(updated.status).toBe(200);
      const deleted = await auth(adminUser).delete(`/api/v1/complaints/${ownComplaint._id}`);
      expect(deleted.status).toBe(200);
    });
  });

  describe('Existing workflows remain intact', () => {
    it('resident can still create a visitor for their own unit', async () => {
      const Visitor = require('../src/models/Visitor');
      const res = await auth(residentUser)
        .post('/api/v1/visitors')
        .send({ name: 'Visitor', unit: unitA1._id.toString(), purpose: 'Delivery' });
      expect(res.status).toBe(201);
      await Visitor.findByIdAndDelete(res.body.data.id);
    });
  });
});
