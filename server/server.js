require('dotenv').config();

const { validateEnv, PORT } = require('./src/config/env');
const app = require('./src/app');
const { connectDB, disconnectDB } = require('./src/config/db');
const { createShutdownHandler } = require('./src/config/shutdown');

validateEnv();

const startServer = async () => {
  try {
    await connectDB();

    console.log('MongoDB Atlas connected successfully');

    const server = app.listen(PORT, () => {
      console.log(`BMMS server running on http://localhost:${PORT}`);
    });

    const shutdown = createShutdownHandler({
      server,
      closeDatabase: disconnectDB,
    });

    // Signal handlers run fire-and-forget from the event loop; the .catch
    // guard prevents an unhandled rejection from crashing mid-shutdown.
    const handleSignal = (signal) => {
      shutdown(signal).catch((error) => {
        console.error(
          'Unexpected error during shutdown:',
          error && error.message ? error.message : error
        );
        process.exit(1);
      });
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));
  } catch (error) {
    console.error('MongoDB connection failed:');
    console.error(error.message);
    process.exit(1);
  }
};

startServer();