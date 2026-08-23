process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Building = require('../src/models/Building');
const Unit = require('../src/models/Unit');
const Resident = require('../src/models/Resident');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');

describe('Resident Account Provisioning (Phase 18)', () => {
  let adminUser;
  let staffUser;
  let residentUserA; // will be linked to residentA
  let residentUserB; // stays unlinked initially
  let buildingOne;
  let buildingTwo;
  let unitOneA;
  let unitTwoA;
  let unitThreeB;
  let residentA;
  let residentB;
  let residentC;
  let residentD;

  const NONEXISTENT_RESIDENT_ID = '507f1f77bcf86cd799439099';
  const MALFORMED_RESIDENT_ID = 'not-an-object-id';

  beforeAll(async () => {
    await startMemoryDb();

    adminUser = await User.create({
      name: 'Admin Manager',
      email: 'admin-acct@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });

    staffUser = await User.create({
      name: 'Sam Staffman',
      email: 'staff-acct@test.local',
      password: 'password123',
      role: 'staff',
      status: 'active',
    });

    buildingOne = await Building.create({ code: 'ACCT-A', name: 'Acct Building One', address: '1 Main St', units: 2 });
    buildingTwo = await Building.create({ code: 'ACCT-B', name: 'Acct Building Two', address: '2 Side St', units: 2 });

    unitOneA = await Unit.create({ unitNumber: 'AA-101', building: buildingOne._id, type: '2BHK', floor: 1, status: 'occupied' });
    unitTwoA = await Unit.create({ unitNumber: 'AA-102', building: buildingOne._id, type: '3BHK', floor: 1, status: 'occupied' });
    unitThreeB = await Unit.create({ unitNumber: 'AB-201', building: buildingTwo._id, type: '2BHK', floor: 2, status: 'occupied' });

    residentA = await Resident.create({ name: 'Resident Alpha', unit: unitOneA._id, phone: '1111111111', type: 'owner', status: 'active' });
    residentB = await Resident.create({ name: 'Resident Beta', unit: unitTwoA._id, phone: '2222222222', type: 'tenant', status: 'active' });
    residentC = await Resident.create({ name: 'Resident Gamma', unit: unitThreeB._id, phone: '3333333333', type: 'owner', status: 'active' });
    residentD = await Resident.create({ name: 'Resident Delta', unit: unitOneA._id, phone: '4444444444', type: 'tenant', status: 'active' });

    residentUserA = await User.create({
      name: 'Alpha User',
      email: 'alpha-user@test.local',
      password: 'password123',
      role: 'resident',
      status: 'active',
      resident: residentA._id,
    });

    residentUserB = await User.create({
      name: 'Beta User',
      email: 'beta-user@test.local',
      password: 'password123',
      role: 'resident',
      status: 'active',
    });
  });

  afterAll(async () => {
    await User.deleteMany({
      email: {
        $in: [
          'admin-acct@test.local',
          'staff-acct@test.local',
          'alpha-user@test.local',
          'beta-user@test.local',
          'gamma-user@test.local',
        ],
      },
    });
    await Resident.deleteMany({ name: { $in: ['Resident Alpha', 'Resident Beta', 'Resident Gamma', 'Resident Delta'] } });
    await Unit.deleteMany({ unitNumber: { $in: ['AA-101', 'AA-102', 'AB-201'] } });
    await Building.deleteMany({ code: { $in: ['ACCT-A', 'ACCT-B'] } });
    await stopMemoryDb();
  });

  const adminGet = (url) =>
    request(app).get(url).set('Authorization', `Bearer ${getAuthToken(adminUser)}`);
  const adminPost = (url) =>
    request(app).post(url).set('Authorization', `Bearer ${getAuthToken(adminUser)}`);
  const adminPatch = (url) =>
    request(app).patch(url).set('Authorization', `Bearer ${getAuthToken(adminUser)}`);
  const staffPatch = (url) =>
    request(app).patch(url).set('Authorization', `Bearer ${getAuthToken(staffUser)}`);
  const asUser = (user) => (url) =>
    request(app).get(url).set('Authorization', `Bearer ${getAuthToken(user)}`);

  describe('Admin links a resident to a user account', () => {
    it('creates a resident-role user with a valid resident link', async () => {
      const res = await adminPost('/api/v1/users').send({
        name: 'Gamma User',
        email: 'gamma-user@test.local',
        password: 'password123',
        role: 'resident',
        resident: residentC._id.toString(),
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('resident');
      expect(res.body.data.resident).toMatchObject({
        id: residentC._id.toString(),
        name: 'Resident Gamma',
      });
      expect(res.body.data.resident.unit).toMatchObject({ unitNumber: 'AB-201' });

      const dbUser = await User.findById(res.body.data.id);
      expect(dbUser.resident.toString()).toBe(residentC._id.toString());
    });

    it('updates an existing user to point at a different resident', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: residentB._id.toString(),
      });

      expect(res.status).toBe(200);
      expect(res.body.data.resident.id).toBe(residentB._id.toString());

      const dbUser = await User.findById(residentUserB._id);
      expect(dbUser.resident.toString()).toBe(residentB._id.toString());
    });

    it('replaces the linked resident with another one', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: residentD._id.toString(),
      });

      expect(res.status).toBe(200);
      expect(res.body.data.resident.id).toBe(residentD._id.toString());

      const dbUser = await User.findById(residentUserB._id);
      expect(dbUser.resident.toString()).toBe(residentD._id.toString());
    });

    it('clears the link when resident is null and when empty string', async () => {
      const clearNull = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({ resident: null });
      expect(clearNull.status).toBe(200);
      expect(clearNull.body.data.resident).toBeNull();

      let dbUser = await User.findById(residentUserB._id);
      expect(dbUser.resident).toBeNull();

      const setAgain = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: residentB._id.toString(),
      });
      expect(setAgain.status).toBe(200);

      const clearEmpty = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({ resident: '' });
      expect(clearEmpty.status).toBe(200);
      expect(clearEmpty.body.data.resident).toBeNull();

      dbUser = await User.findById(residentUserB._id);
      expect(dbUser.resident).toBeNull();
    });

    it('allows keeping a user’s own existing link during update (no false conflict)', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUserA._id}`).send({
        name: 'Alpha User Renamed',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.resident.id).toBe(residentA._id.toString());

      // Explicitly re-sending the same resident must also succeed.
      const reLink = await adminPatch(`/api/v1/users/${residentUserA._id}`).send({
        resident: residentA._id.toString(),
      });
      expect(reLink.status).toBe(200);
      expect(reLink.body.data.resident.id).toBe(residentA._id.toString());
    });
  });

  describe('Admin reads users/residents with account info populated', () => {
    it('GET /users/:id returns the linked resident with name and unit info', async () => {
      const res = await adminGet(`/api/v1/users/${residentUserA._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.resident).toMatchObject({
        id: residentA._id.toString(),
        name: 'Resident Alpha',
      });
      expect(res.body.data.resident.unit.unitNumber).toBe('AA-101');
    });

    it('GET /users list includes populated resident data for linked accounts', async () => {
      const res = await adminGet('/api/v1/users');

      expect(res.status).toBe(200);
      const alpha = res.body.data.find((u) => u.email === 'alpha-user@test.local');
      expect(alpha.resident.name).toBe('Resident Alpha');
      expect(alpha.resident.unit.unitNumber).toBe('AA-101');

      const beta = res.body.data.find((u) => u.email === 'beta-user@test.local');
      expect(beta.resident).toBeNull();
    });

    it('GET /residents list includes additive account summary for linked residents', async () => {
      const res = await adminGet('/api/v1/residents');

      expect(res.status).toBe(200);
      const alpha = res.body.data.find((r) => r.name === 'Resident Alpha');
      expect(alpha.account.linked).toBe(true);
      expect(alpha.account.userEmail).toBe('alpha-user@test.local');

      const beta = res.body.data.find((r) => r.name === 'Resident Beta');
      expect(beta.account.linked).toBe(false);
      expect(beta.account.userEmail).toBeNull();
    });

    it('GET /residents/:id includes the account summary for its own record', async () => {
      const res = await adminGet(`/api/v1/residents/${residentA._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.account.linked).toBe(true);
      expect(res.body.data.account.userEmail).toBe('alpha-user@test.local');
    });
  });

  describe('Validation errors', () => {
    it('rejects linking a nonexistent resident id (valid format)', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: NONEXISTENT_RESIDENT_ID,
      });

      expect(res.status).toBe(400);
      const dbUser = await User.findById(residentUserB._id);
      expect(dbUser.resident).toBeNull();
    });

    it('rejects malformed resident ids', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: MALFORMED_RESIDENT_ID,
      });

      expect(res.status).toBe(400);
    });

    it('rejects linking a resident that is already linked to another user', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: residentA._id.toString(),
      });

      expect(res.status).toBe(400);
      const dbUser = await User.findById(residentUserB._id);
      expect(dbUser.resident).toBeNull();
    });

    it('rejects resident links on staff targets', async () => {
      const res = await adminPatch(`/api/v1/users/${staffUser._id}`).send({
        resident: residentB._id.toString(),
      });

      expect(res.status).toBe(400);
      const dbStaff = await User.findById(staffUser._id);
      expect(dbStaff.resident).toBeNull();
    });

    it('rejects resident links on create for staff roles', async () => {
      const res = await adminPost('/api/v1/users').send({
        name: 'Bad Link Staff',
        email: 'bad-link-staff@test.local',
        password: 'password123',
        role: 'staff',
        resident: residentB._id.toString(),
      });

      expect(res.status).toBe(400);
      const dbUser = await User.findOne({ email: 'bad-link-staff@test.local' });
      expect(dbUser).toBeNull();
    });

    it('rejects invalid role values', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({ role: 'superadmin' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid status values', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({ status: 'paused' });
      expect(res.status).toBe(400);
    });

    it('rejects an admin changing their own role', async () => {
      const res = await adminPatch(`/api/v1/users/${adminUser._id}`).send({ role: 'staff' });
      expect(res.status).toBe(400);
    });

    it('rejects an admin deactivating their own account', async () => {
      const res = await adminPatch(`/api/v1/users/${adminUser._id}`).send({ status: 'inactive' });
      expect(res.status).toBe(400);
    });
  });

  describe('Role transitions keep scope data consistent', () => {
    it('demoting a resident-role user clears their resident link', async () => {
      const created = await adminPost('/api/v1/users').send({
        name: 'Temp Resident',
        email: 'temp-resident@test.local',
        password: 'password123',
        role: 'resident',
        resident: residentB._id.toString(),
      });
      expect(created.status).toBe(201);

      const demoted = await adminPatch(`/api/v1/users/${created.body.data.id}`).send({ role: 'staff' });
      expect(demoted.status).toBe(200);

      const dbUser = await User.findById(created.body.data.id);
      expect(dbUser.resident).toBeNull();

      await User.findByIdAndDelete(created.body.data.id);
    });
  });

  describe('Security — non-admins cannot manage resident links', () => {
    it('staff cannot PATCH a user to add a resident link', async () => {
      const res = await staffPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: residentB._id.toString(),
      });

      expect(res.status).toBe(403);
      const dbUser = await User.findById(residentUserB._id);
      expect(dbUser.resident).toBeNull();
    });

    it('a resident cannot self-promote or attach an arbitrary resident link', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${residentUserA._id}`)
        .set('Authorization', `Bearer ${getAuthToken(residentUserA)}`)
        .send({ role: 'admin', resident: residentC._id.toString() });

      expect(res.status).toBe(403);
      const dbUser = await User.findById(residentUserA._id);
      expect(dbUser.role).toBe('resident');
      expect(dbUser.resident.toString()).toBe(residentA._id.toString());
    });
  });

  describe('Integration — linked resident drives auth + scope', () => {
    it('linked resident can log in and /auth/me reflects the relationship', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({
        email: 'beta-user@test.local',
        password: 'password123',
      });
      expect(login.status).toBe(200);

      // beta-user is currently unlinked (cleared earlier); link them first.
      const link = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: residentB._id.toString(),
      });
      expect(link.status).toBe(200);

      const me = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${getAuthToken(residentUserB)}`);
      expect(me.status).toBe(200);
      expect(me.body.data.user.resident.toString()).toBe(residentB._id.toString());

      // Restore the unlinked state used by other assertions.
      await adminPatch(`/api/v1/users/${residentUserB._id}`).send({ resident: null });
    });

    it('linked resident scope resolves through User → Resident → Unit → Building', async () => {
      const link = await adminPatch(`/api/v1/users/${residentUserB._id}`).send({
        resident: residentB._id.toString(),
      });
      expect(link.status).toBe(200);

      const buildingsRes = await asUser(residentUserB)('/api/v1/buildings');
      expect(buildingsRes.status).toBe(200);
      const visibleCodes = buildingsRes.body.data.map((b) => b.code);
      expect(visibleCodes).toEqual(['ACCT-A']);

      const unitsRes = await asUser(residentUserB)('/api/v1/units');
      expect(unitsRes.status).toBe(200);
      const unitNumbers = unitsRes.body.data.map((u) => u.unitNumber);
      expect(unitNumbers).toContain('AA-102');
      expect(unitNumbers).not.toContain('AB-201');

      await adminPatch(`/api/v1/users/${residentUserB._id}`).send({ resident: null });
    });
  });
});
