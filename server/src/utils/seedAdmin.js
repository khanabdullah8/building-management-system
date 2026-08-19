require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const { connectDB } = require('../config/db');

async function seedAdmin() {
  await connectDB();

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log('Admin user already exists. Skipping seed.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  let adminEmail;
  let adminPassword;
  let generated = false;

  if (email && password) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error('Invalid ADMIN_EMAIL format.');
      await mongoose.disconnect();
      process.exit(1);
    }
    if (password.length < 8) {
      console.error('ADMIN_PASSWORD must be at least 8 characters.');
      await mongoose.disconnect();
      process.exit(1);
    }
    adminEmail = email;
    adminPassword = password;
  } else {
    adminEmail = 'admin@bmms.local';
    adminPassword = crypto.randomBytes(18).toString('base64url');
    generated = true;
  }

  const admin = await User.create({
    name: 'Admin',
    email: adminEmail,
    password: adminPassword,
    role: 'admin',
    status: 'active',
  });

  console.log('Admin user created successfully.');
  console.log(`  Email: ${admin.email}`);
  if (generated) {
    console.log(`  Password (auto-generated, shown once): ${adminPassword}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('Seed failed:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
