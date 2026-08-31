process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_test_placeholder';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Building = require('../src/models/Building');
const { startMemoryDb, stopMemoryDb } = require('./helpers/db');
const { getAuthToken } = require('./helpers/auth');

describe('Admin User Management + Staff Building Assignment (Phase 17)', () => {
  let adminUser;
  let staffA;
  let staffC;
  let residentUser;
  let buildingOne;
  let buildingTwo;
  let buildingThree;

  const NONEXISTENT_BUILDING_ID = '507f1f77bcf86cd799439099';
  const MALFORMED_BUILDING_ID = 'not-an-object-id';

  beforeAll(async () => {
    await startMemoryDb();

    adminUser = await User.create({
      name: 'Admin Manager',
      email: 'admin-mgmt@test.local',
      password: 'password123',
      role: 'admin',
      status: 'active',
    });

    staffA = await User.create({
      name: 'Alice Staffson',
      email: 'staffa-mgmt@test.local',
      password: 'password123',
      role: 'staff',
      status: 'active',
    });

    residentUser = await User.create({
      name: 'Rita Resident',
      email: 'resident-mgmt@test.local',
      password: 'password123',
      role: 'resident',
      status: 'active',
    });

    buildingOne = await Building.create({ code: 'MGT-A', name: 'Building One', units: 10 });
    buildingTwo = await Building.create({ code: 'MGT-B', name: 'Building Two', units: 20 });
    buildingThree = await Building.create({ code: 'MGT-C', name: 'Building Three', units: 30 });
  });

  afterAll(async () => {
    await User.deleteMany({
      email: { $in: ['admin-mgmt@test.local', 'staffa-mgmt@test.local', 'resident-mgmt@test.local'] },
    });
    await Building.deleteMany({ code: { $in: ['MGT-A', 'MGT-B', 'MGT-C'] } });
    await stopMemoryDb();
  });

  const adminGet = (url) =>
    request(app).get(url).set('Authorization', `Bearer ${getAuthToken(adminUser)}`);
  const adminPost = (url) =>
    request(app).post(url).set('Authorization', `Bearer ${getAuthToken(adminUser)}`);
  const adminPatch = (url) =>
    request(app).patch(url).set('Authorization', `Bearer ${getAuthToken(adminUser)}`);
  const adminDelete = (url) =>
    request(app).delete(url).set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

  describe('GET /api/v1/users — list, search, filters', () => {
    it('admin can list users', async () => {
      const res = await adminGet('/api/v1/users');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const emails = res.body.data.map((u) => u.email);
      expect(emails).toContain('admin-mgmt@test.local');
      expect(emails).toContain('staffa-mgmt@test.local');
      expect(res.body.data[0].password).toBeUndefined();
    });

    it('search finds users by name substring', async () => {
      const res = await adminGet('/api/v1/users?search=Alice');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((u) => /alice/i.test(u.name))).toBe(true);
    });

    it('search finds users by email substring', async () => {
      const res = await adminGet('/api/v1/users?search=staffa-mgmt');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].email).toBe('staffa-mgmt@test.local');
    });

    it('search escapes regex special characters safely', async () => {
      const res = await adminGet('/api/v1/users?search=%28%5B%7B');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('role filter returns only matching roles', async () => {
      const res = await adminGet('/api/v1/users?role=staff');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((u) => u.role === 'staff')).toBe(true);
    });

    it('status filter returns only matching statuses', async () => {
      const res = await adminGet('/api/v1/users?status=inactive');

      expect(res.status).toBe(200);
      expect(res.body.data.every((u) => u.status === 'inactive')).toBe(true);
    });
  });

  describe('Staff building assignment lifecycle', () => {
    it('admin assigns two buildings to staff', async () => {
      const res = await adminPatch(`/api/v1/users/${staffA._id}`)
        .send({ buildings: [buildingOne._id.toString(), buildingTwo._id.toString()] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.buildings.map((b) => b.name)).toEqual(
        expect.arrayContaining(['Building One', 'Building Two'])
      );

      const dbUser = await User.findById(staffA._id);
      expect(dbUser.buildings.map((b) => b.toString()).sort()).toEqual(
        [buildingOne._id.toString(), buildingTwo._id.toString()].sort()
      );
    });

    it('admin replaces staff assignments with a different set', async () => {
      const res = await adminPatch(`/api/v1/users/${staffA._id}`)
        .send({ buildings: [buildingThree._id.toString()] });

      expect(res.status).toBe(200);
      expect(res.body.data.buildings).toHaveLength(1);
      expect(res.body.data.buildings[0].name).toBe('Building Three');

      const dbUser = await User.findById(staffA._id);
      expect(dbUser.buildings.map((b) => b.toString())).toEqual([buildingThree._id.toString()]);
    });

    it('admin clears staff assignments with an empty array', async () => {
      const res = await adminPatch(`/api/v1/users/${staffA._id}`).send({ buildings: [] });

      expect(res.status).toBe(200);
      expect(res.body.data.buildings).toHaveLength(0);

      const dbUser = await User.findById(staffA._id);
      expect(dbUser.buildings).toHaveLength(0);
    });

    it('duplicate building IDs are stored once', async () => {
      const res = await adminPatch(`/api/v1/users/${staffA._id}`)
        .send({
          buildings: [
            buildingOne._id.toString(),
            buildingOne._id.toString(),
            buildingTwo._id.toString(),
          ],
        });

      expect(res.status).toBe(200);

      const dbUser = await User.findById(staffA._id);
      expect(dbUser.buildings).toHaveLength(2);
      expect(dbUser.buildings.map((b) => b.toString()).sort()).toEqual(
        [buildingOne._id.toString(), buildingTwo._id.toString()].sort()
      );

      // Restore cleared state for later tests.
      await adminPatch(`/api/v1/users/${staffA._id}`).send({ buildings: [] });
    });
  });

  describe('Populated building data', () => {
    it('GET user returns buildings populated with code and name', async () => {
      await adminPatch(`/api/v1/users/${staffA._id}`)
        .send({ buildings: [buildingOne._id.toString()] });

      const res = await adminGet(`/api/v1/users/${staffA._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.buildings).toHaveLength(1);
      expect(res.body.data.buildings[0]).toMatchObject({
        code: 'MGT-A',
        name: 'Building One',
      });
    });

    it('invalid user ID returns 404', async () => {
      const res = await adminGet('/api/v1/users/not-a-valid-id');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Create users with building assignments', () => {
    it('admin creates a staff user with initial assignments', async () => {
      const res = await adminPost('/api/v1/users').send({
        name: 'Carl Crew',
        email: 'staffc-mgmt@test.local',
        password: 'password123',
        role: 'staff',
        status: 'active',
        buildings: [buildingOne._id.toString(), buildingThree._id.toString()],
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('staff');
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.buildings.map((b) => b.name)).toEqual(
        expect.arrayContaining(['Building One', 'Building Three'])
      );

      staffC = await User.findOne({ email: 'staffc-mgmt@test.local' });
      expect(staffC).not.toBeNull();
      expect(staffC.buildings).toHaveLength(2);
    });

    it('nonexistent building (valid format) returns 400', async () => {
      const res = await adminPatch(`/api/v1/users/${staffA._id}`)
        .send({ buildings: [NONEXISTENT_BUILDING_ID] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const dbUser = await User.findById(staffA._id);
      expect(dbUser.buildings.some((b) => b.toString() === NONEXISTENT_BUILDING_ID)).toBe(false);
    });

    it('malformed building ID returns 400', async () => {
      const res = await adminPatch(`/api/v1/users/${staffA._id}`)
        .send({ buildings: [MALFORMED_BUILDING_ID] });

      expect(res.status).toBe(400);

      const dbUser = await User.findById(staffA._id);
      expect(Array.isArray(dbUser.buildings)).toBe(true);
    });

    it('buildings supplied for an admin target returns 400', async () => {
      const res = await adminPatch(`/api/v1/users/${adminUser._id}`)
        .send({ buildings: [buildingOne._id.toString()] });

      expect(res.status).toBe(400);

      const dbAdmin = await User.findById(adminUser._id);
      expect(dbAdmin.buildings).toHaveLength(0);
    });

    it('buildings supplied for a resident target returns 400', async () => {
      const res = await adminPatch(`/api/v1/users/${residentUser._id}`)
        .send({ buildings: [buildingOne._id.toString()] });

      expect(res.status).toBe(400);

      const dbResident = await User.findById(residentUser._id);
      expect(dbResident.buildings).toHaveLength(0);
    });

    it('creating an admin with buildings returns 400', async () => {
      const res = await adminPost('/api/v1/users').send({
        name: 'Bad Admin',
        email: 'badadmin-mgmt@test.local',
        password: 'password123',
        role: 'admin',
        buildings: [buildingOne._id.toString()],
      });

      expect(res.status).toBe(400);
      const created = await User.findOne({ email: 'badadmin-mgmt@test.local' });
      expect(created).toBeNull();
    });

    it('creating a resident with buildings returns 400', async () => {
      const res = await adminPost('/api/v1/users').send({
        name: 'Bad Resident',
        email: 'badresident-mgmt@test.local',
        password: 'password123',
        role: 'resident',
        buildings: [buildingOne._id.toString()],
      });

      expect(res.status).toBe(400);
      const created = await User.findOne({ email: 'badresident-mgmt@test.local' });
      expect(created).toBeNull();
    });
  });

  describe('Role consistency, validation and self-protection', () => {
    it('demoting a staff member clears their building assignments', async () => {
      const res = await adminPatch(`/api/v1/users/${staffC._id}`).send({ role: 'resident' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('resident');
      expect(res.body.data.buildings).toHaveLength(0);

      const dbUser = await User.findById(staffC._id);
      expect(dbUser.buildings).toHaveLength(0);
    });

    it('invalid role value returns 400', async () => {
      const res = await adminPatch(`/api/v1/users/${staffA._id}`).send({ role: 'superadmin' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const dbUser = await User.findById(staffA._id);
      expect(dbUser.role).toBe('staff');
    });

    it('invalid status value returns 400', async () => {
      const res = await adminPatch(`/api/v1/users/${staffA._id}`).send({ status: 'paused' });

      expect(res.status).toBe(400);

      const dbUser = await User.findById(staffA._id);
      expect(dbUser.status).toBe('active');
    });

    it('admin cannot change their own role', async () => {
      const res = await adminPatch(`/api/v1/users/${adminUser._id}`).send({ role: 'staff' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/own role/i);

      const dbAdmin = await User.findById(adminUser._id);
      expect(dbAdmin.role).toBe('admin');
    });

    it('admin cannot deactivate themselves', async () => {
      const res = await adminPatch(`/api/v1/users/${adminUser._id}`).send({ status: 'inactive' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/deactivate/i);

      const dbAdmin = await User.findById(adminUser._id);
      expect(dbAdmin.status).toBe('active');
    });

    it('deactivating a staff member makes login fail', async () => {
      const deactivate = await adminPatch(`/api/v1/users/${staffA._id}`).send({
        status: 'inactive',
      });
      expect(deactivate.status).toBe(200);

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'staffa-mgmt@test.local', password: 'password123' });
      expect(login.status).toBe(401);

      const reactivate = await adminPatch(`/api/v1/users/${staffA._id}`).send({
        status: 'active',
      });
      expect(reactivate.status).toBe(200);

      const loginAgain = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'staffa-mgmt@test.local', password: 'password123' });
      expect(loginAgain.status).toBe(200);
    });

    it('DELETE with invalid user ID returns 404', async () => {
      const res = await adminDelete('/api/v1/users/not-a-valid-id');

      expect(res.status).toBe(404);
    });
  });

  describe('Staff cannot perform user management', () => {
    let buildingsBefore;

    beforeEach(async () => {
      const fresh = await User.findById(staffA._id);
      staffA = fresh;
      buildingsBefore = fresh.buildings.map((b) => b.toString());
    });

    it('staff cannot list users', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${getAuthToken(staffA)}`);

      expect(res.status).toBe(403);
    });

    it('staff cannot create users', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${getAuthToken(staffA)}`)
        .send({
          name: 'Escalated',
          email: 'escalated-mgmt@test.local',
          password: 'password123',
          role: 'admin',
        });

      expect(res.status).toBe(403);
      const created = await User.findOne({ email: 'escalated-mgmt@test.local' });
      expect(created).toBeNull();
    });

    it('staff cannot modify another user with buildings', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${residentUser._id}`)
        .set('Authorization', `Bearer ${getAuthToken(staffA)}`)
        .send({ buildings: [buildingOne._id.toString()] });

      expect(res.status).toBe(403);

      const dbResident = await User.findById(residentUser._id);
      expect(dbResident.buildings).toHaveLength(0);
    });

    it('staff cannot modify their own building assignments', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${staffA._id}`)
        .set('Authorization', `Bearer ${getAuthToken(staffA)}`)
        .send({
          buildings: [buildingTwo._id.toString(), buildingThree._id.toString()],
          role: 'admin',
        });

      expect(res.status).toBe(403);

      const dbStaff = await User.findById(staffA._id);
      expect(dbStaff.role).toBe('staff');
      expect(dbStaff.buildings.map((b) => b.toString())).toEqual(buildingsBefore);
    });

    it('staff cannot delete users', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${residentUser._id}`)
        .set('Authorization', `Bearer ${getAuthToken(staffA)}`);

      expect(res.status).toBe(403);
      const stillThere = await User.findById(residentUser._id);
      expect(stillThere).not.toBeNull();
    });
  });

  describe('Residents cannot perform user management', () => {
    it('resident cannot list users', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${getAuthToken(residentUser)}`);

      expect(res.status).toBe(403);
    });

    it('resident cannot modify building assignments of another user', async () => {
      const before = await User.findById(staffA._id);
      const beforeBuildings = before.buildings.map((b) => b.toString());

      const res = await request(app)
        .patch(`/api/v1/users/${staffA._id}`)
        .set('Authorization', `Bearer ${getAuthToken(residentUser)}`)
        .send({ buildings: [buildingOne._id.toString()] });

      expect(res.status).toBe(403);

      const after = await User.findById(staffA._id);
      expect(after.buildings.map((b) => b.toString())).toEqual(beforeBuildings);
    });

    it('resident cannot elevate themselves through a self-update', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${residentUser._id}`)
        .set('Authorization', `Bearer ${getAuthToken(residentUser)}`)
        .send({ role: 'admin', status: 'active', name: 'Hacked Name' });

      expect(res.status).toBe(403);

      const dbResident = await User.findById(residentUser._id);
      expect(dbResident.role).toBe('resident');
      expect(dbResident.name).toBe('Rita Resident');
    });

    it('resident cannot delete users', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${staffA._id}`)
        .set('Authorization', `Bearer ${getAuthToken(residentUser)}`);

      expect(res.status).toBe(403);
      const stillThere = await User.findById(staffA._id);
      expect(stillThere).not.toBeNull();
    });
  });
});
