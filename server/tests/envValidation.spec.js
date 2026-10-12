const path = require('path');
const { spawnSync } = require('child_process');

const ENV_MODULE_PATH = path.resolve(__dirname, '../src/config/env.js');
const SERVER_ROOT = path.resolve(__dirname, '..');

const VALID_MONGO_URI = 'mongodb://127.0.0.1:27017/bmms_env_validation';
const VALID_JWT_SECRET = 'tR7kQ2mV9xL4pD8sW1zN6bH3jF5yC0aE';

function runValidateEnv(nodeEnv, overrides) {
  const script = `
    process.env.NODE_ENV = ${JSON.stringify(nodeEnv)};
    let exitCode = null;
    process.exit = (code) => {
      exitCode = code;
      throw new Error('__EXIT__');
    };
    try {
      require(${JSON.stringify(ENV_MODULE_PATH)}).validateEnv();
      console.log('VALIDATION_OK');
    } catch (error) {
      if (error.message === '__EXIT__') {
        console.log('VALIDATION_EXIT:' + exitCode);
      } else {
        console.log('UNEXPECTED_ERROR:' + error.message);
      }
    }
  `;

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      MONGO_URI: VALID_MONGO_URI,
      JWT_SECRET: '',
      ...overrides,
    },
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('Phase 44 env validation (production JWT_SECRET)', () => {
  it('rejects a missing JWT_SECRET in production', () => {
    const { status, stdout, stderr } = runValidateEnv('production', { JWT_SECRET: '' });

    expect(status).toBe(0);
    expect(stdout).toContain('VALIDATION_EXIT:1');
    expect(stderr).toMatch(/JWT_SECRET/);
  });

  it('rejects a too-short JWT_SECRET in production without printing it', () => {
    const secret = 'short-secret';
    const { status, stdout, stderr } = runValidateEnv('production', { JWT_SECRET: secret });

    expect(status).toBe(0);
    expect(stdout).toContain('VALIDATION_EXIT:1');
    expect(stderr).toMatch(/at least 32 characters/);
    expect(stderr).not.toContain(secret);
    expect(stdout).not.toContain(secret);
  });

  it('rejects an obvious placeholder JWT_SECRET in production without printing it', () => {
    const secret = 'changeme-changeme-changeme-changeme';
    const { status, stdout, stderr } = runValidateEnv('production', { JWT_SECRET: secret });

    expect(status).toBe(0);
    expect(stdout).toContain('VALIDATION_EXIT:1');
    expect(stderr).toMatch(/placeholder/);
    expect(stderr).not.toContain(secret);
    expect(stdout).not.toContain(secret);
  });

  it('accepts a strong JWT_SECRET in production', () => {
    const { status, stdout, stderr } = runValidateEnv('production', {
      JWT_SECRET: VALID_JWT_SECRET,
    });

    expect(status).toBe(0);
    expect(stdout).toContain('VALIDATION_OK');
    expect(stderr).toBe('');
  });

  it('still allows development without JWT_SECRET (warning only)', () => {
    const { status, stdout, stderr } = runValidateEnv('development', { JWT_SECRET: '' });

    expect(status).toBe(0);
    expect(stdout).toContain('VALIDATION_OK');
    expect(stderr).toMatch(/JWT_SECRET is not set/);
  });
});