const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDB, disconnectDB } = require('../../src/config/db');

let mongod;

async function startMemoryDb() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('bmms_test');
  await connectDB();
  return mongod;
}

async function stopMemoryDb() {
  await disconnectDB();
  if (mongod) {
    await mongod.stop();
  }
}

module.exports = { startMemoryDb, stopMemoryDb };
