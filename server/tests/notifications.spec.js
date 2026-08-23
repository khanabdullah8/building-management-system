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
const Notice = require('../src/models/Notice');
const Notification = require('../src/models/Notification');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');

describe('In-App Notifications (Phase 19)', () => {
  let admin;
  let staffA;
  let staffB;
  let inactiveStaff;
  let residentUserA;
  let inactiveResidentUser;
  let unlinkedUser;
  let buildingOne;
  let buildingTwo;
  let unitOne;
  let unitTwo;

  beforeAll(async () => {
    await startMemoryDb();

    admin = await User.create({
      name: 'Notif Admin',
      email: 'admin-notif@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });

    staffA = await User.create({
      name: 'Staff A',
      email: 'staffa-notif@test.local',
      password: 'password123',
      role: 'staff',
      status: 'active',
      buildings: [],
    });

    staffB = await User.create({
      name: 'Staff B',
      email: 'staffb-notif@test.local',
      password: 'password123',
      role: 'staff',
      status: 'active',
      buildings: [],
    });

    inactiveStaff = await User.create({
      name: 'Inactive Staff',
      email: 'inactive-staff-notif@test.local',
      password: 'password123',
      role: 'staff',
      status: 'inactive',
    });

    residentUserA = await User.create({
      name: 'Resident User A',
      email: 'residenta-notif@test.local',
      password: 'password123',
      role: 'resident',
      status: 'active',
    });

    inactiveResidentUser = await User.create({
      name: 'Inactive Resident User',
      email: 'inactiveresident-notif@test.local',
      password: 'password123',
      role: 'resident',
      status: 'inactive',
    });

    unlinkedUser = await User.create({
      name: 'Unlinked User',
      email: 'unlinked-notif@test.local',
      password: 'password123',
      role: 'resident',
      status: 'active',
    });

    buildingOne = await Building.create({ code: 'NTF-A', name: 'Notif Building One', address: '1 St', units: 4 });
    buildingTwo = await Building.create({ code: 'NTF-B', name: 'Notif Building Two', address: '2 St', units: 4 });

    unitOne = await Unit.create({ unitNumber: 'NA-101', building: buildingOne._id, type: '2BHK', floor: 1, status: 'occupied' });
    unitTwo = await Unit.create({ unitNumber: 'NB-201', building: buildingTwo._id, type: '2BHK', floor: 2, status: 'occupied' });

    // Scope assignments now that buildings exist.
    staffA.buildings = [buildingOne._id];
    await staffA.save();
    staffB.buildings = [buildingTwo._id];
    await staffB.save();
    inactiveStaff.buildings = [buildingOne._id];
    await inactiveStaff.save();

    const residentA = await Resident.create({ name: 'Resident A', unit: unitOne._id, phone: '1111111111', type: 'owner', status: 'active' });
    residentUserA.resident = residentA._id;
    await residentUserA.save();

    const inactiveResident = await Resident.create({ name: 'Inactive Resident', unit: unitOne._id, phone: '2222222222', type: 'tenant', status: 'active' });
    inactiveResidentUser.resident = inactiveResident._id;
    await inactiveResidentUser.save();
  });

  afterAll(async () => {
    await User.deleteMany({
      email: {
        $in: [
          'admin-notif@test.local',
          'staffa-notif@test.local',
          'staffb-notif@test.local',
          'inactive-staff-notif@test.local',
          'residenta-notif@test.local',
          'inactiveresident-notif@test.local',
          'unlinked-notif@test.local',
        ],
      },
    });
    await Resident.deleteMany({ name: { $in: ['Resident A', 'Inactive Resident'] } });
    await Unit.deleteMany({ unitNumber: { $in: ['NA-101', 'NB-201'] } });
    await Building.deleteMany({ code: { $in: ['NTF-A', 'NTF-B'] } });
    await stopMemoryDb();
  });

  const asUser = (user) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${getAuthToken(user)}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${getAuthToken(user)}`),
    patch: (url) => request(app).patch(url).set('Authorization', `Bearer ${getAuthToken(user)}`),
  });

  const unreadCountFor = async (user, extra = {}) =>
    Notification.countDocuments({ user: user._id, ...extra });

  describe('Feed access control', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/notifications');

      expect(res.status).toBe(401);
    });

    it('returns only the authenticated user’s own notifications', async () => {
      await Notification.create({ user: admin._id, type: 'system', title: 'Admin-only item' });
      await Notification.create({ user: staffA._id, type: 'system', title: 'Staff-only item' });

      const adminFeed = await asUser(admin).get('/api/v1/notifications');
      expect(adminFeed.status).toBe(200);
      expect(adminFeed.body.success).toBe(true);
      const adminTitles = adminFeed.body.data.map((n) => n.title);
      expect(adminTitles).toContain('Admin-only item');
      expect(adminTitles).not.toContain('Staff-only item');
      expect(adminFeed.body.data.every((n) => n.user === admin._id.toString())).toBe(true);

      const staffFeed = await asUser(staffA).get('/api/v1/notifications');
      const staffTitles = staffFeed.body.data.map((n) => n.title);
      expect(staffTitles).toContain('Staff-only item');
      expect(staffTitles).not.toContain('Admin-only item');
    });

    it('orders the feed newest first', async () => {
      const older = await Notification.create({
        user: unlinkedUser._id,
        type: 'system',
        title: 'Older first seeded',
        createdAt: new Date(Date.now() - 60000),
      });
      const newer = await Notification.create({
        user: unlinkedUser._id,
        type: 'system',
        title: 'Newer second seeded',
      });

      const res = await asUser(unlinkedUser).get('/api/v1/notifications');
      const titles = res.body.data.map((n) => n.title);
      expect(titles.indexOf('Newer second seeded')).toBeLessThan(titles.indexOf('Older first seeded'));
    });
  });

  describe('Notice creation fan-out', () => {
    it('building notice reaches assigned staff and linked residents of that building only', async () => {
      const beforeA = await unreadCountFor(staffA);
      const beforeRes = await unreadCountFor(residentUserA);
      const beforeB = await unreadCountFor(staffB);
      const beforeAdmin = await unreadCountFor(admin);

      const res = await asUser(admin)
        .post('/api/v1/notices')
        .send({ title: 'Water shutdown B1', category: 'notice', building: buildingOne._id.toString() });
      expect(res.status).toBe(201);

      expect(await unreadCountFor(staffA)).toBe(beforeA + 1);
      const staffANotification = await Notification.findOne({ user: staffA._id, entityId: res.body.data.id });
      expect(staffANotification.type).toBe('notice');
      expect(staffANotification.title).toBe('Water shutdown B1');
      expect(staffANotification.building.toString()).toBe(buildingOne._id.toString());
      expect(staffANotification.entityType).toBe('notice');

      expect(await unreadCountFor(residentUserA)).toBe(beforeRes + 1);
      expect(await unreadCountFor(staffB)).toBe(beforeB);
      expect(await unreadCountFor(inactiveStaff)).toBe(0);
      expect(await unreadCountFor(admin)).toBe(beforeAdmin);
    });

    it('global notice reaches all active users except the actor', async () => {
      const beforeStaffA = await unreadCountFor(staffA);
      const beforeStaffB = await unreadCountFor(staffB);
      const beforeRes = await unreadCountFor(residentUserA);
      const beforeUnlinked = await unreadCountFor(unlinkedUser);
      const beforeAdmin = await unreadCountFor(admin);

      const res = await asUser(admin)
        .post('/api/v1/notices')
        .send({ title: 'Town hall Friday', category: 'announcement' });
      expect(res.status).toBe(201);

      expect(await unreadCountFor(staffA)).toBe(beforeStaffA + 1);
      expect(await unreadCountFor(staffB)).toBe(beforeStaffB + 1);
      expect(await unreadCountFor(residentUserA)).toBe(beforeRes + 1);
      expect(await unreadCountFor(unlinkedUser)).toBe(beforeUnlinked + 1);
      expect(await unreadCountFor(inactiveStaff)).toBe(0);
      expect(await unreadCountFor(inactiveResidentUser)).toBe(0);
      expect(await unreadCountFor(admin)).toBe(beforeAdmin);
    });

    it('excludes the acting staff from their own building notice', async () => {
      const beforeStaffA = await unreadCountFor(staffA);
      const beforeRes = await unreadCountFor(residentUserA);
      const beforeAdmin = await unreadCountFor(admin);

      const res = await asUser(staffA)
        .post('/api/v1/notices')
        .send({ title: 'Elevator maintenance window', category: 'event', building: buildingOne._id.toString() });
      expect(res.status).toBe(201);

      expect(await unreadCountFor(staffA)).toBe(beforeStaffA);
      expect(await unreadCountFor(residentUserA)).toBe(beforeRes + 1);
      expect(await unreadCountFor(admin)).toBe(beforeAdmin);
    });
  });

  describe('Maintenance fan-out', () => {
    it('creation notifies the affected building’s staff only', async () => {
      const beforeStaffB = await unreadCountFor(staffB);
      const beforeRes = await unreadCountFor(residentUserA);
      const beforeAdmin = await unreadCountFor(admin);

      const res = await asUser(admin)
        .post('/api/v1/maintenance')
        .send({ title: 'Leaky faucet', unit: unitOne._id.toString(), priority: 'medium', status: 'open' });
      expect(res.status).toBe(201);

      expect(await unreadCountFor(staffA)).toBeGreaterThanOrEqual(1);
      const notification = await Notification.findOne({ user: staffA._id, entityType: 'maintenance' })
        .sort({ createdAt: -1 });
      expect(notification.title).toBe('Leaky faucet');
      expect(notification.entityId).toBe(res.body.data.id);

      expect(await unreadCountFor(staffB)).toBe(beforeStaffB);
      expect(await unreadCountFor(residentUserA)).toBe(beforeRes);
      expect(await unreadCountFor(admin)).toBe(beforeAdmin);
    });

    it('status update notifies the unit’s linked resident users', async () => {
      const created = await asUser(admin)
        .post('/api/v1/maintenance')
        .send({ title: 'Broken window latch', unit: unitOne._id.toString(), priority: 'high', status: 'open' });
      expect(created.status).toBe(201);

      const beforeRes = await unreadCountFor(residentUserA);
      const beforeStaffB = await unreadCountFor(staffB);
      const beforeStaffA = await unreadCountFor(staffA);

      const res = await asUser(staffA)
        .patch(`/api/v1/maintenance/${created.body.data.id}`)
        .send({ status: 'completed' });
      expect(res.status).toBe(200);

      expect(await unreadCountFor(residentUserA)).toBe(beforeRes + 1);
      const notification = await Notification.findOne({ user: residentUserA._id, entityId: created.body.data.id });
      expect(notification.type).toBe('maintenance');
      expect(notification.title).toBe('Broken window latch');

      // Staff and the actor get nothing from a status change.
      expect(await unreadCountFor(staffB)).toBe(beforeStaffB);
      expect(await unreadCountFor(staffA)).toBe(beforeStaffA);
    });

    it('does not notify when the status does not actually change', async () => {
      const created = await asUser(admin)
        .post('/api/v1/maintenance')
        .send({ title: 'No-op status', unit: unitOne._id.toString(), priority: 'low', status: 'open' });

      const before = await unreadCountFor(residentUserA);
      const res = await asUser(staffA)
        .patch(`/api/v1/maintenance/${created.body.data.id}`)
        .send({ status: 'open' });
      expect(res.status).toBe(200);

      expect(await unreadCountFor(residentUserA)).toBe(before);
    });

    it('unit without linked resident accounts produces zero resident notifications', async () => {
      const orphan = await Resident.create({ name: 'Orphan Resident', unit: unitTwo._id, phone: '', type: 'owner', status: 'active' });

      const created = await asUser(admin)
        .post('/api/v1/maintenance')
        .send({ title: 'B2 repaint', unit: unitTwo._id.toString(), priority: 'low', status: 'open' });
      expect(created.status).toBe(201);

      // staffB (building two) is notified about the new request...
      expect(await unreadCountFor(staffB)).toBeGreaterThanOrEqual(1);
      const bBefore = await unreadCountFor(staffB);
      const unlinkedBefore = await unreadCountFor(unlinkedUser);

      const res = await asUser(staffB)
        .patch(`/api/v1/maintenance/${created.body.data.id}`)
        .send({ status: 'in-progress' });
      expect(res.status).toBe(200);

      // ...but no resident users exist for that unit, so nobody else is added.
      expect(await unreadCountFor(staffB)).toBe(bBefore);
      expect(await unreadCountFor(unlinkedUser)).toBe(unlinkedBefore);

      await Resident.findByIdAndDelete(orphan._id);
    });
  });

  describe('Mark one as read', () => {
    it('marks the owner’s notification read and sets readAt (idempotent)', async () => {
      const seeded = await Notification.create({ user: residentUserA._id, type: 'system', title: 'Read me once' });

      const first = await asUser(residentUserA).patch(`/api/v1/notifications/${seeded._id}/read`);
      expect(first.status).toBe(200);
      expect(first.body.data.readAt).toBeTruthy();
      const readAtAfterFirst = first.body.data.readAt;

      const dbDoc = await Notification.findById(seeded._id);
      expect(dbDoc.readAt).toBeTruthy();

      const second = await asUser(residentUserA).patch(`/api/v1/notifications/${seeded._id}/read`);
      expect(second.status).toBe(200);
      expect(second.body.data.readAt).toBe(readAtAfterFirst);

      const dbDocAgain = await Notification.findById(seeded._id);
      expect(dbDocAgain.readAt.getTime()).toBe(dbDoc.readAt.getTime());
    });

    it('returns 404 for another user’s notification', async () => {
      const seeded = await Notification.create({ user: residentUserA._id, type: 'system', title: 'Private item' });

      const res = await asUser(staffA).patch(`/api/v1/notifications/${seeded._id}/read`);

      expect(res.status).toBe(404);
      const dbDoc = await Notification.findById(seeded._id);
      expect(dbDoc.readAt).toBeNull();
    });

    it('returns 404 for an invalid notification id', async () => {
      const res = await asUser(residentUserA).patch('/api/v1/notifications/not-an-object-id/read');

      expect(res.status).toBe(404);
    });
  });

  describe('Mark all as read', () => {
    it('marks every unread notification read and is idempotent', async () => {
      await Notification.create({ user: unlinkedUser._id, type: 'system', title: 'Batch 1' });
      await Notification.create({ user: unlinkedUser._id, type: 'system', title: 'Batch 2' });
      await Notification.create({ user: unlinkedUser._id, type: 'system', title: 'Batch 3' });

      const before = await unreadCountFor(unlinkedUser, { readAt: null });
      expect(before).toBeGreaterThanOrEqual(3);

      const first = await asUser(unlinkedUser).post('/api/v1/notifications/read-all');
      expect(first.status).toBe(200);
      expect(first.body.data.updated).toBe(before);
      expect(await unreadCountFor(unlinkedUser, { readAt: null })).toBe(0);

      const second = await asUser(unlinkedUser).post('/api/v1/notifications/read-all');
      expect(second.status).toBe(200);
      expect(second.body.data.updated).toBe(0);
      expect(await unreadCountFor(unlinkedUser, { readAt: null })).toBe(0);
    });

    it('never touches other users’ notifications', async () => {
      const othersBefore = await unreadCountFor(residentUserA, { readAt: null });

      await asUser(unlinkedUser).post('/api/v1/notifications/read-all');

      expect(await unreadCountFor(residentUserA, { readAt: null })).toBe(othersBefore);
    });
  });

  describe('Feed integrity after mutations', () => {
    it('keeps counts and ownership correct after read operations', async () => {
      const feedBefore = await asUser(residentUserA).get('/api/v1/notifications');
      const totalBefore = feedBefore.body.data.length;
      const unreadBefore = feedBefore.body.data.filter((n) => !n.readAt).length;
      expect(totalBefore).toBeGreaterThan(0);

      const firstUnread = feedBefore.body.data.find((n) => !n.readAt);
      await asUser(residentUserA).patch(`/api/v1/notifications/${firstUnread.id}/read`);

      const feedAfter = await asUser(residentUserA).get('/api/v1/notifications');
      expect(feedAfter.body.data.length).toBe(totalBefore);
      expect(feedAfter.body.data.filter((n) => !n.readAt).length).toBe(unreadBefore - 1);
      expect(feedAfter.body.data.every((n) => n.user === residentUserA._id.toString())).toBe(true);
    });
  });
});
