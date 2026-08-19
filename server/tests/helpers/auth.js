const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../../src/models/User');
const { JWT_SECRET } = require('../../src/config/env');

const TEST_JWT_SECRET = JWT_SECRET || 'test-secret';

let testAdmin;

async function createTestAdmin() {
  testAdmin = await User.create({
    name: 'Test Admin',
    email: 'testadmin@test.local',
    password: 'password123',
    role: 'admin',
    status: 'active',
  });
  return testAdmin;
}

async function removeTestAdmin() {
  if (testAdmin) {
    await User.findByIdAndDelete(testAdmin._id);
    testAdmin = null;
  }
}

function getAuthToken(user) {
  const u = user || testAdmin;
  const payload = {
    id: u._id.toString(),
    email: u.email,
    role: u.role,
  };
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
}

function authRequest(app, token) {
  const agent = request(app);
  const setAuth = (req) => req.set('Authorization', token);
  return {
    get: (url) => setAuth(agent.get(url)),
    post: (url) => setAuth(agent.post(url)),
    patch: (url) => setAuth(agent.patch(url)),
    put: (url) => setAuth(agent.put(url)),
    delete: (url) => setAuth(agent.delete(url)),
  };
}

module.exports = { createTestAdmin, removeTestAdmin, getAuthToken, authRequest };
