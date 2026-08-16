require('dotenv').config();

const { validateEnv, PORT } = require('./src/config/env');
const app = require('./src/app');
const { connectDB } = require('./src/config/db');

validateEnv();

const startServer = async () => {
  try {
    await connectDB();

    console.log('MongoDB Atlas connected successfully');

    app.listen(PORT, () => {
      console.log(`BMMS server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB connection failed:');
    console.error(error.message);
    process.exit(1);
  }
};

startServer();