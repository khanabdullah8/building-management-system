process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const AuditLog = require('../src/models/AuditLog');
const Notification = require('../src/models/Notification');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');

describe('Audit Logging (Phase 20)', () => {
  let admin;
  let staffA;
  let residentUserA;
  let buildingOne;
  let buildingTwo;
  let unitOne;
  let unitTwo;

  beforeAll(async () => {
    await startMemoryDb();

    admin = await User.create({
      name: 'Audit Admin',
      email: 'admin-audit@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });

    staffA = await User.create({
      name: 'Audit Staff A',
      email: 'staffa-audit@test.local',
      password: 'password123',
      role: 'staff',
      status: 'active',
    });

    residentUserA = await User.create({
      name: 'Audit Resident A',
      email: 'residenta-audit@test.local',
      password: 'password123',
      role: 'resident',
      status: 'active',
    });

    buildingOne = await Building.create({ code: 'AUD-A', name: 'Audit Building One', address: '1 St', units: 2 });
    buildingTwo = await Building.create({ code: 'AUD-B', name: 'Audit Building Two', address: '2 St', units: 2 });

    unitOne = await Unit.create({ unitNumber: 'AA-101', building: buildingOne._id, type: '2BHK', floor: 1, status: 'occupied' });
    unitTwo = await Unit.create({ unitNumber: 'AB-201', building: buildingTwo._id, type: '2BHK', floor: 2, status: 'occupied' });

    staffA.buildings = [buildingOne._id];
    await staffA.save();

    const residentA = await require('../src/models/Resident').create({
      name: 'Audit Resident A Person',
      unit: unitOne._id,
      phone: '1111111111',
      type: 'owner',
      status: 'active',
    });
    residentUserA.resident = residentA._id;
    await residentUserA.save();
  });

  afterAll(async () => {
    await User.deleteMany({
      email: {
        $in: [
          'admin-audit@test.local',
          'staffa-audit@test.local',
          'residenta-audit@test.local',
          'temp-staff-audit@test.local',
        ],
      },
    });
    await Building.deleteMany({ code: { $in: ['AUD-A', 'AUD-B'] } });
    await stopMemoryDb();
  });

  const asUser = (user) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${getAuthToken(user)}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${getAuthToken(user)}`),
    patch: (url) => request(app).patch(url).set('Authorization', `Bearer ${getAuthToken(user)}`),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${getAuthToken(user)}`),
  });

  const getLogs = async (query = '', user = admin) => {
    const res = await asUser(user).get(`/api/v1/audit-logs${query}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    return res.body.data;
  };

  const totalLogs = async () => {
    const logs = await getLogs('?limit=500');
    return logs.length;
  };

  describe('Access control', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/audit-logs');
      expect(res.status).toBe(401);
    });

    it('rejects staff with 403', async () => {
      const res = await asUser(staffA).get('/api/v1/audit-logs');
      expect(res.status).toBe(403);
    });

    it('rejects residents with 403', async () => {
      const res = await asUser(residentUserA).get('/api/v1/audit-logs');
      expect(res.status).toBe(403);
    });

    it('returns 404 for write attempts (no write routes exist)', async () => {
      const postRes = await asUser(admin).post('/api/v1/audit-logs').send({ module: 'building' });
      const patchRes = await asUser(admin).patch('/api/v1/audit-logs/000000000000000000000000').send({});
      const deleteRes = await asUser(admin).delete('/api/v1/audit-logs/000000000000000000000000');

      expect(postRes.status).toBe(404);
      expect(patchRes.status).toBe(404);
      expect(deleteRes.status).toBe(404);
    });
  });

  describe('Read semantics', () => {
    it('orders results newest first', async () => {
      await AuditLog.create({
        actorId: admin._id.toString(),
        actorName: admin.name,
        actorRole: 'admin',
        action: 'created',
        module: 'parking',
        resourceLabel: 'SEED-OLD',
        createdAt: new Date(Date.now() - 60000),
      });
      await AuditLog.create({
        actorId: admin._id.toString(),
        actorName: admin.name,
        actorRole: 'admin',
        action: 'created',
        module: 'parking',
        resourceLabel: 'SEED-NEW',
      });

      const logs = await getLogs('?module=parking&limit=500');
      expect(logs[0].resourceLabel).toBe('SEED-NEW');
      expect(logs.some((l) => l.resourceLabel === 'SEED-OLD')).toBe(true);
    });

    it('filters by module', async () => {
      const logs = await getLogs('?module=parking&limit=500');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((l) => l.module === 'parking')).toBe(true);
    });

    it('filters by action', async () => {
      const logs = await getLogs('?action=created&limit=500');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((l) => l.action === 'created')).toBe(true);
    });

    it('combines module and action filters', async () => {
      const logs = await getLogs('?module=parking&action=updated&limit=500');
      expect(logs.every((l) => l.module === 'parking' && l.action === 'updated')).toBe(true);
    });

    it('rejects an invalid action filter with 400', async () => {
      const res = await asUser(admin).get('/api/v1/audit-logs?action=hacked');
      expect(res.status).toBe(400);
      expect(res.body.errors.action).toBeTruthy();
    });

    it('respects the limit parameter and falls back to default for invalid values', async () => {
      for (let i = 0; i < 3; i += 1) {
        await AuditLog.create({
          actorId: admin._id.toString(),
          actorName: admin.name,
          actorRole: 'admin',
          action: 'deleted',
          module: 'unit',
          resourceLabel: `SEED-LIMIT-${i}`,
          createdAt: new Date(Date.now() - i * 1000),
        });
      }

      const limited = await getLogs('?action=deleted&module=unit&limit=2');
      expect(limited.length).toBe(2);

      const invalidLimit = await getLogs('?limit=abc');
      expect(Array.isArray(invalidLimit)).toBe(true);
      expect(invalidLimit.length).toBeGreaterThan(0);
    });
  });

  describe('Event generation', () => {
    it('records created, updated, and deleted events for buildings with snapshots that survive deletion', async () => {
      const createRes = await asUser(admin)
        .post('/api/v1/buildings')
        .send({ code: 'AUD-C', name: 'Audit Building C', address: '3 St', units: 0 });
      expect(createRes.status).toBe(201);
      const buildingId = createRes.body.data.id;

      const patchRes = await asUser(admin)
        .patch(`/api/v1/buildings/${buildingId}`)
        .send({ name: 'Audit Building C Renamed' });
      expect(patchRes.status).toBe(200);

      const deleteRes = await asUser(admin).delete(`/api/v1/buildings/${buildingId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs('?module=building&limit=500');

      const created = events.find((e) => e.resourceLabel === 'AUD-C' && e.action === 'created');
      const updated = events.find((e) => e.resourceLabel === 'AUD-C' && e.action === 'updated');
      const deleted = events.find((e) => e.resourceLabel === 'AUD-C' && e.action === 'deleted');

      expect(created).toBeTruthy();
      expect(created.actorId).toBe(admin._id.toString());
      expect(created.actorName).toBe('Audit Admin');
      expect(created.actorRole).toBe('admin');
      expect(created.buildingId).toBe(buildingId);
      expect(created.buildingName).toBe('Audit Building C');

      expect(updated).toBeTruthy();

      expect(deleted).toBeTruthy();
      // Snapshot persists even though the building document is gone.
      expect(deleted.buildingName).toBe('Audit Building C Renamed');
    });

    it('records unit events and tracks a moved unit to its final building', async () => {
      const createRes = await asUser(admin)
        .post('/api/v1/units')
        .send({ unitNumber: 'AU-999', building: buildingOne._id, type: '1BHK', floor: 9 });
      expect(createRes.status).toBe(201);
      const unitId = createRes.body.data.id;

      const moveRes = await asUser(admin)
        .patch(`/api/v1/units/${unitId}`)
        .send({ building: buildingTwo._id });
      expect(moveRes.status).toBe(200);
      expect(moveRes.body.data.building.id).toBe(buildingTwo._id.toString());

      const deleteRes = await asUser(admin).delete(`/api/v1/units/${unitId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs(`?module=unit&limit=500`);
      const created = events.find((e) => e.resourceId === unitId && e.action === 'created');
      const updated = events.find((e) => e.resourceId === unitId && e.action === 'updated');
      const deleted = events.find((e) => e.resourceId === unitId && e.action === 'deleted');

      expect(created.buildingId).toBe(buildingOne._id.toString());
      expect(updated.buildingId).toBe(buildingTwo._id.toString());
      expect(deleted.buildingId).toBe(buildingTwo._id.toString());
    });

    it('records resident events including reassignment to another building', async () => {
      const createRes = await asUser(admin)
        .post('/api/v1/residents')
        .send({ name: 'Aud Movable Resident', unit: unitOne._id, type: 'tenant', status: 'active' });
      expect(createRes.status).toBe(201);
      const residentId = createRes.body.data.id;

      const moveRes = await asUser(admin)
        .patch(`/api/v1/residents/${residentId}`)
        .send({ unit: unitTwo._id });
      expect(moveRes.status).toBe(200);

      const deleteRes = await asUser(admin).delete(`/api/v1/residents/${residentId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs('?module=resident&limit=500');
      const created = events.find((e) => e.resourceId === residentId && e.action === 'created');
      const updated = events.find((e) => e.resourceId === residentId && e.action === 'updated');
      const deleted = events.find((e) => e.resourceId === residentId && e.action === 'deleted');

      expect(created.resourceLabel).toBe('Aud Movable Resident');
      expect(created.buildingId).toBe(buildingOne._id.toString());
      expect(updated.buildingId).toBe(buildingTwo._id.toString());
      expect(deleted).toBeTruthy();
    });

    it('records user events and keeps the actor snapshot after the acting user is deleted', async () => {
      const createUserRes = await asUser(admin)
        .post('/api/v1/users')
        .send({
          name: 'Temp Staff',
          email: 'temp-staff-audit@test.local',
          password: 'password123',
          role: 'staff',
        });
      expect(createUserRes.status).toBe(201);
      const tempUserId = createUserRes.body.data.id;

      const tempUser = await User.findById(tempUserId);
      tempUser.buildings = [buildingOne._id];
      await tempUser.save();

      // Temp user performs a mutation so their snapshot lands on an event.
      const complaintRes = await asUser(tempUser)
        .post('/api/v1/complaints')
        .send({ subject: 'Temp complaint', unit: unitOne._id, priority: 'low', status: 'open' });
      expect(complaintRes.status).toBe(201);

      const patchUserRes = await asUser(admin)
        .patch(`/api/v1/users/${tempUserId}`)
        .send({ name: 'Temp Staff Renamed' });
      expect(patchUserRes.status).toBe(200);

      const deleteUserRes = await asUser(admin).delete(`/api/v1/users/${tempUserId}`);
      expect(deleteUserRes.status).toBe(200);

      const userEvents = await getLogs('?module=user&limit=500');
      const createdUser = userEvents.find((e) => e.resourceId === tempUserId && e.action === 'created');
      const updatedUser = userEvents.find((e) => e.resourceId === tempUserId && e.action === 'updated');
      const deletedUser = userEvents.find((e) => e.resourceId === tempUserId && e.action === 'deleted');
      expect(createdUser.resourceLabel).toBe('temp-staff-audit@test.local');
      expect(updatedUser).toBeTruthy();
      expect(deletedUser).toBeTruthy();

      // The complaint event still names the now-deleted actor.
      const complaintEvents = await getLogs('?module=complaint&limit=500');
      const byTemp = complaintEvents.find(
        (e) => e.resourceLabel === 'Temp complaint' && e.action === 'created'
      );
      expect(byTemp).toBeTruthy();
      expect(byTemp.actorId).toBe(tempUserId);
      expect(byTemp.actorName).toBe('Temp Staff');
      expect(byTemp.actorRole).toBe('staff');
    });

    it('records maintenance events', async () => {
      const createRes = await asUser(staffA)
        .post('/api/v1/maintenance')
        .send({ title: 'Aud leak fix', unit: unitOne._id, priority: 'high', status: 'open' });
      expect(createRes.status).toBe(201);
      const requestId = createRes.body.data.id;

      const patchRes = await asUser(staffA)
        .patch(`/api/v1/maintenance/${requestId}`)
        .send({ status: 'in-progress' });
      expect(patchRes.status).toBe(200);

      const deleteRes = await asUser(admin).delete(`/api/v1/maintenance/${requestId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs('?module=maintenance&limit=500');
      const created = events.find((e) => e.resourceId === requestId && e.action === 'created');
      const updated = events.find((e) => e.resourceId === requestId && e.action === 'updated');
      const deleted = events.find((e) => e.resourceId === requestId && e.action === 'deleted');

      expect(created.resourceLabel).toBe('Aud leak fix');
      expect(created.buildingId).toBe(buildingOne._id.toString());
      expect(updated).toBeTruthy();
      expect(deleted.actorId).toBe(admin._id.toString());
    });

    it('records complaint events', async () => {
      const createRes = await asUser(residentUserA)
        .post('/api/v1/complaints')
        .send({ subject: 'Aud noisy neighbor', unit: unitOne._id, priority: 'medium', status: 'open' });
      expect(createRes.status).toBe(201);
      const complaintId = createRes.body.data.id;

      const patchRes = await asUser(admin)
        .patch(`/api/v1/complaints/${complaintId}`)
        .send({ status: 'resolved' });
      expect(patchRes.status).toBe(200);

      const deleteRes = await asUser(admin).delete(`/api/v1/complaints/${complaintId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs('?module=complaint&limit=500');
      const created = events.find((e) => e.resourceId === complaintId && e.action === 'created');
      const updated = events.find((e) => e.resourceId === complaintId && e.action === 'updated');
      const deleted = events.find((e) => e.resourceId === complaintId && e.action === 'deleted');

      expect(created.actorRole).toBe('resident');
      expect(created.buildingId).toBe(buildingOne._id.toString());
      expect(updated).toBeTruthy();
      expect(deleted).toBeTruthy();
    });

    it('records notice events and leaves global notices without a building', async () => {
      const scopedRes = await asUser(admin)
        .post('/api/v1/notices')
        .send({
          title: 'Aud scoped notice',
          category: 'announcement',
          description: 'Scoped.',
          building: buildingOne._id,
        });
      expect(scopedRes.status).toBe(201);
      const scopedId = scopedRes.body.data.id;

      const globalRes = await asUser(admin)
        .post('/api/v1/notices')
        .send({
          title: 'Aud global notice',
          category: 'notice',
          description: 'Global.',
        });
      expect(globalRes.status).toBe(201);
      const globalId = globalRes.body.data.id;

      const deleteRes = await asUser(admin).delete(`/api/v1/notices/${scopedId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs('?module=notice&limit=500');
      const scopedCreated = events.find((e) => e.resourceId === scopedId && e.action === 'created');
      const globalCreated = events.find((e) => e.resourceId === globalId && e.action === 'created');
      const scopedDeleted = events.find((e) => e.resourceId === scopedId && e.action === 'deleted');

      expect(scopedCreated.buildingId).toBe(buildingOne._id.toString());
      expect(globalCreated.buildingId).toBeNull();
      expect(globalCreated.buildingName).toBe('');
      expect(scopedDeleted).toBeTruthy();
    });

    it('records visitor events', async () => {
      const createRes = await asUser(admin)
        .post('/api/v1/visitors')
        .send({ name: 'Aud Visitor', unit: unitOne._id, purpose: 'Delivery' });
      expect(createRes.status).toBe(201);
      const visitorId = createRes.body.data.id;

      const patchRes = await asUser(admin)
        .patch(`/api/v1/visitors/${visitorId}`)
        .send({ checkOutAt: new Date().toISOString() });
      expect(patchRes.status).toBe(200);

      const deleteRes = await asUser(admin).delete(`/api/v1/visitors/${visitorId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs('?module=visitor&limit=500');
      const created = events.find((e) => e.resourceId === visitorId && e.action === 'created');
      const updated = events.find((e) => e.resourceId === visitorId && e.action === 'updated');
      const deleted = events.find((e) => e.resourceId === visitorId && e.action === 'deleted');

      expect(created.resourceLabel).toBe('Aud Visitor');
      expect(updated).toBeTruthy();
      expect(deleted).toBeTruthy();
    });

    it('records parking events', async () => {
      const createRes = await asUser(admin)
        .post('/api/v1/parking')
        .send({ slotCode: 'AUD-P1', building: buildingOne._id });
      expect(createRes.status).toBe(201);
      const slotId = createRes.body.data.id;

      const patchRes = await asUser(admin)
        .patch(`/api/v1/parking/${slotId}`)
        .send({ vehicleType: 'bike' });
      expect(patchRes.status).toBe(200);

      const deleteRes = await asUser(admin).delete(`/api/v1/parking/${slotId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs('?module=parking&limit=500');
      const created = events.find((e) => e.resourceId === slotId && e.action === 'created');
      const updated = events.find((e) => e.resourceId === slotId && e.action === 'updated');
      const deleted = events.find((e) => e.resourceId === slotId && e.action === 'deleted');

      expect(created.resourceLabel).toBe('AUD-P1');
      expect(updated).toBeTruthy();
      expect(deleted).toBeTruthy();
    });

    it('records expense events', async () => {
      const createRes = await asUser(admin)
        .post('/api/v1/expenses')
        .send({ category: 'utilities', building: buildingOne._id, amount: 150 });
      expect(createRes.status).toBe(201);
      const expenseId = createRes.body.data.id;

      const patchRes = await asUser(admin)
        .patch(`/api/v1/expenses/${expenseId}`)
        .send({ amount: 175 });
      expect(patchRes.status).toBe(200);

      const deleteRes = await asUser(admin).delete(`/api/v1/expenses/${expenseId}`);
      expect(deleteRes.status).toBe(200);

      const events = await getLogs('?module=expense&limit=500');
      const created = events.find((e) => e.resourceId === expenseId && e.action === 'created');
      const updated = events.find((e) => e.resourceId === expenseId && e.action === 'updated');
      const deleted = events.find((e) => e.resourceId === expenseId && e.action === 'deleted');

      expect(created.resourceLabel).toBe('utilities');
      expect(created.buildingId).toBe(buildingOne._id.toString());
      expect(updated).toBeTruthy();
      expect(deleted).toBeTruthy();
    });

    it('records bill and payment events, and never records a blocked bill deletion', async () => {
      const billRes = await asUser(admin)
        .post('/api/v1/billing')
        .send({ unit: unitOne._id, period: '2026-08', amount: 100 });
      expect(billRes.status).toBe(201);
      const billId = billRes.body.data.id;

      const billPatchRes = await asUser(admin)
        .patch(`/api/v1/billing/${billId}`)
        .send({ amount: 120 });
      expect(billPatchRes.status).toBe(200);

      const paymentRes = await asUser(admin)
        .post('/api/v1/payments')
        .send({ bill: billId, amount: 50, method: 'cash' });
      expect(paymentRes.status).toBe(201);
      const paymentId = paymentRes.body.data.id;

      // Bill deletion must be blocked (payment exists) → no deleted event.
      const blockedDelete = await asUser(admin).delete(`/api/v1/billing/${billId}`);
      expect(blockedDelete.status).toBe(400);
      const billEvents = await getLogs('?module=bill&limit=500');
      expect(
        billEvents.some((e) => e.resourceId === billId && e.action === 'deleted')
      ).toBe(false);

      const paymentPatchRes = await asUser(admin)
        .patch(`/api/v1/payments/${paymentId}`)
        .send({ amount: 60 });
      expect(paymentPatchRes.status).toBe(200);

      const paymentDeleteRes = await asUser(admin).delete(`/api/v1/payments/${paymentId}`);
      expect(paymentDeleteRes.status).toBe(200);

      const createdBill = billEvents.find((e) => e.resourceId === billId && e.action === 'created');
      const updatedBill = billEvents.find((e) => e.resourceId === billId && e.action === 'updated');
      expect(createdBill.resourceLabel).toBe(billRes.body.data.billNo);
      expect(createdBill.buildingId).toBe(buildingOne._id.toString());
      expect(updatedBill).toBeTruthy();

      const paymentEvents = await getLogs('?module=payment&limit=500');
      const createdPayment = paymentEvents.find((e) => e.resourceId === paymentId && e.action === 'created');
      const updatedPayment = paymentEvents.find((e) => e.resourceId === paymentId && e.action === 'updated');
      const deletedPayment = paymentEvents.find((e) => e.resourceId === paymentId && e.action === 'deleted');
      expect(createdPayment.buildingId).toBe(buildingOne._id.toString());
      expect(updatedPayment).toBeTruthy();
      expect(deletedPayment).toBeTruthy();
    });
  });

  describe('Operations that must not be audited', () => {
    it('creates zero events for validation failures', async () => {
      const before = await totalLogs();

      const res = await asUser(admin).post('/api/v1/buildings').send({});
      expect(res.status).toBe(400);

      expect(await totalLogs()).toBe(before);
    });

    it('creates zero events for forbidden operations', async () => {
      const before = await totalLogs();

      const res = await asUser(staffA)
        .post('/api/v1/buildings')
        .send({ code: 'STAFF-X', name: 'Staff X', address: 'x' });
      expect(res.status).toBe(403);

      expect(await totalLogs()).toBe(before);
    });

    it('creates zero events for notification read operations', async () => {
      const notif = await Notification.create({ user: admin._id, type: 'system', title: 'Audit silence check' });
      const before = await totalLogs();

      const readRes = await asUser(admin).patch(`/api/v1/notifications/${notif.id}/read`);
      expect(readRes.status).toBe(200);
      const allRes = await asUser(admin).post('/api/v1/notifications/read-all');
      expect(allRes.status).toBe(200);

      expect(await totalLogs()).toBe(before);
    });

    it('creates zero events for logins (successful or failed)', async () => {
      const before = await totalLogs();

      const ok = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin-audit@test.local', password: 'password123' });
      expect(ok.status).toBe(200);

      const bad = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin-audit@test.local', password: 'wrong-password' });
      expect(bad.status).toBe(401);

      expect(await totalLogs()).toBe(before);
    });
  });
});
