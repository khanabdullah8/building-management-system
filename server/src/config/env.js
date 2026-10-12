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

const MIN_JWT_SECRET_LENGTH = 32;
const PLACEHOLDER_JWT_SECRETS = new Set([
  'secret',
  'password',
  'development',
  'test',
  'test-secret',
  'admin',
  '123456',
  '12345678',
]);
const PLACEHOLDER_JWT_MARKERS = [
  'changeme',
  'change-me',
  'your-secret',
  'your_secret',
  'jwt-secret',
  'jwtsecret',
  'placeholder',
  'replace-me',
  'replace_me',
];

function isPlaceholderSecret(secret) {
  const normalized = secret.trim().toLowerCase();
  if (PLACEHOLDER_JWT_SECRETS.has(normalized)) return true;
  return PLACEHOLDER_JWT_MARKERS.some((marker) => normalized.includes(marker));
}

function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  if (NODE_ENV === 'production') {
    missing.push(...REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]));
  }

  if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  if (NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET;

    if (secret.length < MIN_JWT_SECRET_LENGTH) {
      console.error(
        `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production.`
      );
      process.exit(1);
    }

    if (isPlaceholderSecret(secret)) {
      console.error(
        'JWT_SECRET must not be an obvious placeholder value in production.'
      );
      process.exit(1);
    }
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
