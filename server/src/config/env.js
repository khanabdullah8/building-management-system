const DEFAULT_PORT = 5000;

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const MONGO_URI = process.env.MONGO_URI;

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const ALLOWED_ORIGINS = CLIENT_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;

const REQUIRED = ['MONGO_URI'];
const REQUIRED_IN_PRODUCTION = ['JWT_SECRET'];

function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  if (NODE_ENV === 'production') {
    missing.push(...REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]));
  }

  if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  if (!process.env.JWT_SECRET && NODE_ENV !== 'production') {
    console.warn(
      '[BMMS] JWT_SECRET is not set. It will be required for authentication (Phase 2).'
    );
  }
}

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = {
  NODE_ENV,
  PORT,
  MONGO_URI,
  JWT_SECRET,
  ALLOWED_ORIGINS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  validateEnv,
};
