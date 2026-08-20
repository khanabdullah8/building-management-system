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
const Visitor = require('../src/models/Visitor');
const Complaint = require('../src/models/Complaint');
const Bill = require('../src/models/Bill');
const Payment = require('../src/models/Payment');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');

describe('Building-scoped Authorization (Phase 16)', () => {
  let adminUser, staffUser, residentUser;
  let buildingA, buildingB, unitA1, unitB1, residentA, staffUserWithBuildings;

  beforeAll(async () => {
    await startMemoryDb();

    adminUser = await User.create({
      name: 'Admin',
      email: 'admin-auth@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });

    buildingA = await Building.create({ code: 'BLDA', name: 'Building A', address: '123 Main St', units: 2 });
    buildingB = await Building.create({ code: 'BLDB', name: 'Building B', address: '456 Side St', units: 2 });

    unitA1 = await Unit.create({ unitNumber: 'A-101', building: buildingA._id, type: '2BHK', floor: 1, status: 'occupied' });
    unitB1 = await Unit.create({ unitNumber: 'B-101', building: buildingB._id, type: '3BHK', floor: 1, status: 'occupied' });

    residentA = await Resident.create({ name: 'Resident A', unit: unitA1._id, phone: '1234567890', type: 'owner', status: 'active' });

    residentUser = await User.create({
      name: 'Resident User',
      email: 'resident-auth@test.local',
      password: 'password123',
      role: 'resident',
      status: 'active',
      resident: residentA._id,
    });

    staffUserWithBuildings = await User.create({
      name: 'Staff A',
      email: 'staffa-auth@test.local',
      password: 'password123',
      role: 'staff',
      status: 'active',
      buildings: [buildingA._id],
    });
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $in: ['admin-auth@test.local', 'staffa-auth@test.local', 'resident-auth@test.local'] } });
    await Resident.deleteMany({ _id: residentA._id });
    await Unit.deleteMany({ _id: { $in: [unitA1._id, unitB1._id] } });
    await Building.deleteMany({ _id: { $in: [buildingA._id, buildingB._id] } });
    await stopMemoryDb();
  });

  describe('Admin global access', () => {
    it('admin can list all buildings', async () => {
      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/buildings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('admin can access any building by id', async () => {
      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/buildings/${buildingB._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Building B');
    });

    it('admin can see all units', async () => {
      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('admin can see dashboard with real data', async () => {
      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.units).toBeGreaterThanOrEqual(2);
      expect(res.body.data.buildings).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Staff scoped access', () => {
    it('staff can only see assigned buildings', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .get('/api/v1/buildings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((b) => b.id || b._id);
      expect(ids).toContain(buildingA._id.toString());
      expect(ids).not.toContain(buildingB._id.toString());
    });

    it('staff can access assigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .get(`/api/v1/buildings/${buildingA._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Building A');
    });

    it('staff gets 403 for unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .get(`/api/v1/buildings/${buildingB._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('staff can only see units in assigned buildings', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((u) => u.id || u._id);
      expect(ids).toContain(unitA1._id.toString());
      expect(ids).not.toContain(unitB1._id.toString());
    });

    it('staff dashboard is scoped to assigned buildings', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.units).toBeGreaterThanOrEqual(1);
      expect(res.body.data.buildings).toBe(1);
    });

    it('staff cannot create buildings', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/buildings')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'NEWB', name: 'New Building' });

      expect(res.status).toBe(403);
    });

    it('staff can only see residents in assigned buildings', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .get('/api/v1/residents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((r) => {
        if (r.unit && r.unit.building) {
          const bId = r.unit.building.id || r.unit.building._id;
          expect(bId.toString()).toBe(buildingA._id.toString());
        }
      });
    });
  });

  describe('Resident scoped access', () => {
    it('resident can only see their own unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        expect(res.body.data[0].id || res.body.data[0]._id).toBe(unitA1._id.toString());
      }
    });

    it('resident can access their own unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get(`/api/v1/units/${unitA1._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('resident gets 403 for another unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get(`/api/v1/units/${unitB1._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('resident can only see their own maintenance requests', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get('/api/v1/maintenance')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((m) => {
        if (m.unit) {
          const unitRef = m.unit.id || m.unit._id || m.unit;
          expect(unitRef).toBe(unitA1._id.toString());
        }
      });
    });

    it('resident can only see their own bills', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get('/api/v1/billing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((b) => {
        if (b.unit) {
          const unitRef = b.unit.id || b.unit._id || b.unit;
          expect(unitRef).toBe(unitA1._id.toString());
        }
      });
    });

    it('resident dashboard shows limited data', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.buildings).toBe(1);
      expect(res.body.data.units).toBe(1);
    });
  });

  describe('Staff write authorization', () => {
    let staffMaintenanceInA, staffVisitorInA, staffComplaintInA, staffResidentInA, staffBillInA;

    afterAll(async () => {
      const cleanupIds = [staffMaintenanceInA, staffVisitorInA, staffComplaintInA, staffResidentInA, staffBillInA].filter(Boolean);
      await Maintenance.deleteMany({ _id: { $in: cleanupIds.filter(Boolean) } });
      await Visitor.deleteMany({ _id: { $in: cleanupIds.filter(Boolean) } });
      await Complaint.deleteMany({ _id: { $in: cleanupIds.filter(Boolean) } });
      await Resident.deleteMany({ _id: { $in: cleanupIds.filter(Boolean) } });
      await Bill.deleteMany({ _id: { $in: cleanupIds.filter(Boolean) } });
    });

    it('staff can create unit in assigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${token}`)
        .send({ unitNumber: 'STAFF-NEW-1', building: buildingA._id.toString(), type: '1BHK', floor: 2, status: 'vacant' });

      expect(res.status).toBe(201);
      expect(res.body.data.unitNumber).toBe('STAFF-NEW-1');

      await Unit.findByIdAndDelete(res.body.data.id);
    });

    it('staff gets 403 creating unit in unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${token}`)
        .send({ unitNumber: 'STAFF-BAD-1', building: buildingB._id.toString(), type: '1BHK', floor: 1, status: 'vacant' });

      expect(res.status).toBe(403);
    });

    it('staff gets 403 updating unit in unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .patch(`/api/v1/units/${unitB1._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: '4BHK' });

      expect(res.status).toBe(403);
    });

    it('staff gets 403 deleting unit in unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .delete(`/api/v1/units/${unitB1._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('staff can create maintenance in assigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Staff test maintenance', unit: unitA1._id.toString(), priority: 'medium', status: 'open' });

      expect(res.status).toBe(201);
      staffMaintenanceInA = res.body.data.id;
    });

    it('staff gets 403 creating maintenance in unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Bad maintenance', unit: unitB1._id.toString(), priority: 'medium', status: 'open' });

      expect(res.status).toBe(403);
    });

    it('staff gets 403 updating maintenance in unassigned building', async () => {
      const otherMaintenance = await Maintenance.create({ title: 'Other maint', unit: unitB1._id, priority: 'low', status: 'open' });
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .patch(`/api/v1/maintenance/${otherMaintenance._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Hacked maintenance' });

      expect(res.status).toBe(403);
      await Maintenance.findByIdAndDelete(otherMaintenance._id);
    });

    it('staff gets 403 deleting maintenance in unassigned building', async () => {
      const otherMaintenance = await Maintenance.create({ title: 'Other maint del', unit: unitB1._id, priority: 'low', status: 'open' });
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .delete(`/api/v1/maintenance/${otherMaintenance._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      await Maintenance.findByIdAndDelete(otherMaintenance._id);
    });

    it('staff can create visitor in assigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/visitors')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Staff Visitor', unit: unitA1._id.toString(), purpose: 'Meeting' });

      expect(res.status).toBe(201);
      staffVisitorInA = res.body.data.id;
    });

    it('staff gets 403 creating visitor in unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/visitors')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bad Visitor', unit: unitB1._id.toString(), purpose: 'Infiltration' });

      expect(res.status).toBe(403);
    });

    it('staff gets 403 updating visitor in unassigned building', async () => {
      const otherVisitor = await Visitor.create({ name: 'Other', unit: unitB1._id });
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .patch(`/api/v1/visitors/${otherVisitor._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked Visitor' });

      expect(res.status).toBe(403);
      await Visitor.findByIdAndDelete(otherVisitor._id);
    });

    it('staff gets 403 deleting visitor in unassigned building', async () => {
      const otherVisitor = await Visitor.create({ name: 'Other del', unit: unitB1._id });
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .delete(`/api/v1/visitors/${otherVisitor._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      await Visitor.findByIdAndDelete(otherVisitor._id);
    });

    it('staff can create complaint in assigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: 'Staff test complaint', unit: unitA1._id.toString(), priority: 'medium', status: 'open' });

      expect(res.status).toBe(201);
      staffComplaintInA = res.body.data.id;
    });

    it('staff gets 403 creating complaint in unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: 'Bad complaint', unit: unitB1._id.toString(), priority: 'medium', status: 'open' });

      expect(res.status).toBe(403);
    });

    it('staff gets 403 updating complaint in unassigned building', async () => {
      const otherComplaint = await Complaint.create({ subject: 'Other complaint', unit: unitB1._id, building: buildingB._id, priority: 'low', status: 'open' });
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .patch(`/api/v1/complaints/${otherComplaint._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: 'Hacked complaint' });

      expect(res.status).toBe(403);
      await Complaint.findByIdAndDelete(otherComplaint._id);
    });

    it('staff gets 403 deleting complaint in unassigned building', async () => {
      const otherComplaint = await Complaint.create({ subject: 'Other complaint del', unit: unitB1._id, building: buildingB._id, priority: 'low', status: 'open' });
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .delete(`/api/v1/complaints/${otherComplaint._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      await Complaint.findByIdAndDelete(otherComplaint._id);
    });

    it('staff can create resident in assigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/residents')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Staff Resident', unit: unitA1._id.toString(), phone: '9999999999', type: 'tenant', status: 'active' });

      expect(res.status).toBe(201);
      staffResidentInA = res.body.data.id;
    });

    it('staff gets 403 creating resident in unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/residents')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bad Resident', unit: unitB1._id.toString(), phone: '8888888888', type: 'tenant', status: 'active' });

      expect(res.status).toBe(403);
    });

    it('staff can create bill in assigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${token}`)
        .send({ unit: unitA1._id.toString(), period: '2026-01', amount: 1000, description: 'Staff test bill' });

      expect(res.status).toBe(201);
      staffBillInA = res.body.data.id;
    });

    it('staff gets 403 creating bill in unassigned building', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${token}`)
        .send({ unit: unitB1._id.toString(), period: '2026-01', amount: 2000, description: 'Bad bill' });

      expect(res.status).toBe(403);
    });

    it('staff gets 403 updating bill in unassigned building', async () => {
      const otherBill = await Bill.create({ unit: unitB1._id, period: '2026-02', amount: 500, status: 'pending' });
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .patch(`/api/v1/billing/${otherBill._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 99999 });

      expect(res.status).toBe(403);
      await Bill.findByIdAndDelete(otherBill._id);
    });

    it('staff gets 403 deleting bill in unassigned building', async () => {
      const otherBill = await Bill.create({ unit: unitB1._id, period: '2026-03', amount: 300, status: 'pending' });
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .delete(`/api/v1/billing/${otherBill._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      await Bill.findByIdAndDelete(otherBill._id);
    });
  });

  describe('Resident write authorization', () => {
    let ownMaintenance, ownVisitor, ownComplaint;

    afterAll(async () => {
      if (ownMaintenance) await Maintenance.findByIdAndDelete(ownMaintenance);
      if (ownVisitor) await Visitor.findByIdAndDelete(ownVisitor);
      if (ownComplaint) await Complaint.findByIdAndDelete(ownComplaint);
    });

    it('resident can create maintenance for own unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Own unit leak', unit: unitA1._id.toString(), priority: 'high', status: 'open' });

      expect(res.status).toBe(201);
      ownMaintenance = res.body.data.id;
    });

    it('resident gets 403 creating maintenance for another unit in different building', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .post('/api/v1/maintenance')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Other building maint', unit: unitB1._id.toString(), priority: 'medium', status: 'open' });

      expect(res.status).toBe(403);
    });

    it('resident gets 403 updating maintenance belonging to another unit', async () => {
      const otherMaint = await Maintenance.create({ title: 'Other unit maint', unit: unitB1._id, priority: 'low', status: 'open' });
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .patch(`/api/v1/maintenance/${otherMaint._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Hacked' });

      expect(res.status).toBe(403);
      await Maintenance.findByIdAndDelete(otherMaint._id);
    });

    it('resident gets 403 deleting maintenance belonging to another unit', async () => {
      const otherMaint = await Maintenance.create({ title: 'Other unit del', unit: unitB1._id, priority: 'low', status: 'open' });
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .delete(`/api/v1/maintenance/${otherMaint._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      await Maintenance.findByIdAndDelete(otherMaint._id);
    });

    it('resident can create visitor for own unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .post('/api/v1/visitors')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Own visitor', unit: unitA1._id.toString(), purpose: 'Delivery' });

      expect(res.status).toBe(201);
      ownVisitor = res.body.data.id;
    });

    it('resident gets 403 creating visitor for another unit in different building', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .post('/api/v1/visitors')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Other visitor', unit: unitB1._id.toString(), purpose: 'Intrusion' });

      expect(res.status).toBe(403);
    });

    it('resident gets 403 updating visitor belonging to another unit', async () => {
      const otherVisitor = await Visitor.create({ name: 'Other v', unit: unitB1._id });
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .patch(`/api/v1/visitors/${otherVisitor._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked v' });

      expect(res.status).toBe(403);
      await Visitor.findByIdAndDelete(otherVisitor._id);
    });

    it('resident gets 403 deleting visitor belonging to another unit', async () => {
      const otherVisitor = await Visitor.create({ name: 'Other v del', unit: unitB1._id });
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .delete(`/api/v1/visitors/${otherVisitor._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      await Visitor.findByIdAndDelete(otherVisitor._id);
    });

    it('resident can create complaint for own unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: 'Own unit complaint', unit: unitA1._id.toString(), priority: 'medium', status: 'open' });

      expect(res.status).toBe(201);
      ownComplaint = res.body.data.id;
    });

    it('resident gets 403 creating complaint for another unit in different building', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: 'Bad complaint', unit: unitB1._id.toString(), priority: 'medium', status: 'open' });

      expect(res.status).toBe(403);
    });

    it('resident gets 403 updating complaint belonging to another unit', async () => {
      const otherComplaint = await Complaint.create({ subject: 'Other c', unit: unitB1._id, building: buildingB._id, priority: 'low', status: 'open' });
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .patch(`/api/v1/complaints/${otherComplaint._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: 'Hacked c' });

      expect(res.status).toBe(403);
      await Complaint.findByIdAndDelete(otherComplaint._id);
    });

    it('resident gets 403 deleting complaint belonging to another unit', async () => {
      const otherComplaint = await Complaint.create({ subject: 'Other c del', unit: unitB1._id, building: buildingB._id, priority: 'low', status: 'open' });
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .delete(`/api/v1/complaints/${otherComplaint._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      await Complaint.findByIdAndDelete(otherComplaint._id);
    });
  });

  describe('Resident billing/payment write isolation', () => {
    let billInB, paymentInB;

    beforeAll(async () => {
      billInB = await Bill.create({ unit: unitB1._id, period: '2026-isolation', amount: 123, status: 'pending' });
      paymentInB = await Payment.create({ bill: billInB._id, amount: 123, method: 'cash', status: 'completed' });
    });

    afterAll(async () => {
      await Payment.deleteMany({ _id: paymentInB._id });
      await Bill.deleteMany({ _id: billInB._id });
    });

    it('resident gets 403 creating payment for bill in another unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ bill: billInB._id.toString(), amount: 50, method: 'cash' });

      expect(res.status).toBe(403);
    });

    it('resident gets 403 updating payment for bill in another unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .patch(`/api/v1/payments/${paymentInB._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: 'hacked' });

      expect(res.status).toBe(403);
    });

    it('resident gets 403 deleting payment for bill in another unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .delete(`/api/v1/payments/${paymentInB._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('resident gets 403 deleting bill in another unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .delete(`/api/v1/billing/${billInB._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('resident gets 403 updating bill in another unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .patch(`/api/v1/billing/${billInB._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 99999 });

      expect(res.status).toBe(403);
    });

    it('resident gets 403 creating bill for another unit', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .post('/api/v1/billing')
        .set('Authorization', `Bearer ${token}`)
        .send({ unit: unitB1._id.toString(), period: '2026-hack', amount: 100 });

      expect(res.status).toBe(403);
    });
  });

  describe('Resident ?building= scope escalation prevention', () => {
    let billA, billB, paymentA, paymentB;

    beforeAll(async () => {
      billA = await Bill.create({ unit: unitA1._id, period: '2026-01', amount: 500, status: 'pending' });
      billB = await Bill.create({ unit: unitB1._id, period: '2026-01', amount: 800, status: 'pending' });
      paymentA = await Payment.create({ bill: billA._id, amount: 500, method: 'cash', status: 'completed' });
      paymentB = await Payment.create({ bill: billB._id, amount: 800, method: 'card', status: 'completed' });
    });

    afterAll(async () => {
      await Payment.deleteMany({ _id: { $in: [paymentA._id, paymentB._id] } });
      await Bill.deleteMany({ _id: { $in: [billA._id, billB._id] } });
    });

    it('billing ?building= does not widen resident scope', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get(`/api/v1/billing?building=${buildingB._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const billIds = res.body.data.map((b) => b.id || b._id);
      expect(billIds).not.toContain(billB._id.toString());

      const allBelongToResidentUnit = res.body.data.every(
        (b) => (b.unit?.id || b.unit?._id || b.unit) === unitA1._id.toString()
      );
      expect(allBelongToResidentUnit).toBe(true);
    });

    it('billing without ?building= shows only own unit bills for resident', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get('/api/v1/billing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const billIds = res.body.data.map((b) => b.id || b._id);
      expect(billIds).toContain(billA._id.toString());
      expect(billIds).not.toContain(billB._id.toString());
    });

    it('payment ?building= does not widen resident scope', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get(`/api/v1/payments?building=${buildingB._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const paymentIds = res.body.data.map((p) => p.id || p._id);
      expect(paymentIds).not.toContain(paymentB._id.toString());
    });

    it('payment without ?building= shows only own unit payments for resident', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const paymentIds = res.body.data.map((p) => p.id || p._id);
      expect(paymentIds).toContain(paymentA._id.toString());
      expect(paymentIds).not.toContain(paymentB._id.toString());
    });
  });

  describe('Complaint search with scope', () => {
    let complaintA, complaintB, commonComplaint;

    beforeAll(async () => {
      complaintA = await Complaint.create({ subject: 'Leaky faucet urgent', unit: unitA1._id, building: buildingA._id, priority: 'high', status: 'open' });
      complaintB = await Complaint.create({ subject: 'Broken elevator', unit: unitB1._id, building: buildingB._id, priority: 'high', status: 'open' });
      commonComplaint = await Complaint.create({ subject: 'Leaky faucet in lobby', unit: null, building: buildingA._id, location: 'Lobby', priority: 'medium', status: 'open' });
    });

    afterAll(async () => {
      await Complaint.deleteMany({ _id: { $in: [complaintA._id, complaintB._id, commonComplaint._id] } });
    });

    it('admin search finds all matching complaints across buildings', async () => {
      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/complaints?search=faucet')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((c) => c.id || c._id);
      expect(ids).toContain(complaintA._id.toString());
      expect(ids).toContain(commonComplaint._id.toString());
    });

    it('admin search returns empty for non-matching term', async () => {
      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/complaints?search=xyznonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it('staff search is scoped to assigned buildings only', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .get('/api/v1/complaints?search=elevator')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((c) => c.id || c._id);
      expect(ids).not.toContain(complaintB._id.toString());
    });

    it('staff search finds matching complaints within assigned buildings', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .get('/api/v1/complaints?search=faucet')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((c) => c.id || c._id);
      expect(ids).toContain(complaintA._id.toString());
      expect(ids).toContain(commonComplaint._id.toString());
    });

    it('resident search is scoped to own unit and building common-area', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get('/api/v1/complaints?search=faucet')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((c) => c.id || c._id);
      expect(ids).toContain(complaintA._id.toString());
      expect(ids).toContain(commonComplaint._id.toString());
      expect(ids).not.toContain(complaintB._id.toString());
    });

    it('resident search returns empty for term only in other buildings', async () => {
      const token = getAuthToken(residentUser);
      const res = await request(app)
        .get('/api/v1/complaints?search=elevator')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe('Payment edge case: deleted bill unit', () => {
    let orphanBill, orphanPayment;
    let tempUnit;

    beforeAll(async () => {
      tempUnit = await Unit.create({ unitNumber: 'TEMP-DEL', building: buildingA._id, type: '1BHK', floor: 0, status: 'vacant' });
      orphanBill = await Bill.create({ unit: tempUnit._id, period: '2026-99', amount: 999, status: 'pending' });
      await Unit.findByIdAndDelete(tempUnit._id);
    });

    afterAll(async () => {
      if (orphanPayment) await Payment.findByIdAndDelete(orphanPayment._id);
      await Bill.findByIdAndDelete(orphanBill._id);
    });

    it('staff gets 403 creating payment for bill with deleted unit', async () => {
      const token = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ bill: orphanBill._id.toString(), amount: 999, method: 'cash' });

      expect(res.status).toBe(403);
    });

    it('admin can create payment for bill with deleted unit', async () => {
      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ bill: orphanBill._id.toString(), amount: 999, method: 'cash' });

      expect(res.status).toBe(201);
      orphanPayment = res.body.data.id;
    });

    it('staff gets 403 updating payment for bill with deleted unit', async () => {
      if (!orphanPayment) {
        const token = getAuthToken(adminUser);
        const res = await request(app)
          .post('/api/v1/payments')
          .set('Authorization', `Bearer ${token}`)
          .send({ bill: orphanBill._id.toString(), amount: 999, method: 'cash' });
        orphanPayment = res.body.data.id;
      }

      const staffToken = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .patch(`/api/v1/payments/${orphanPayment}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ notes: 'hacked' });

      expect(res.status).toBe(403);
    });

    it('staff gets 403 deleting payment for bill with deleted unit', async () => {
      const staffToken = getAuthToken(staffUserWithBuildings);
      const res = await request(app)
        .delete(`/api/v1/payments/${orphanPayment}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Unauthorized access', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/buildings');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/buildings')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET: secret } = require('../src/config/env');
      const token = jwt.sign(
        { id: adminUser._id.toString(), email: adminUser.email, role: adminUser.role },
        secret,
        { expiresIn: '0s' }
      );
      const res = await request(app)
        .get('/api/v1/buildings')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });
});
