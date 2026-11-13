import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

export const OFFLINE_MODE = parseBoolean(process.env.OFFLINE_MODE, true);
export const ENABLE_PLATFORM_ADMIN = !OFFLINE_MODE && parseBoolean(process.env.ENABLE_PLATFORM_ADMIN, false);
export const DATABASE_PROVIDER = String(process.env.DATABASE_PROVIDER || 'sqlite').trim().toLowerCase() === 'postgres'
  ? 'postgres'
  : 'sqlite';
if (DATABASE_PROVIDER === 'postgres' && OFFLINE_MODE) {
  throw new Error('PostgreSQL chỉ được phép dùng cho bản SaaS, không dùng trong offline mode.');
}
// Online SaaS uses a shared PostgreSQL database with tenant_id isolation.
// Keep the legacy value readable for old deployments, but do not advertise
// per-tenant SQLite as a supported online production profile.
export const DATABASE_MODE = !OFFLINE_MODE && DATABASE_PROVIDER === 'sqlite'
  && process.env.DATABASE_MODE?.trim().toLowerCase() === 'per_tenant'
  ? 'per_tenant'
  : 'shared';
export const PER_TENANT_DATABASES = DATABASE_MODE === 'per_tenant';
export const API_PORT = Number(process.env.API_PORT || 3101);
export const DATA_DIR = path.resolve(process.env.HKDPLUS_DATA_DIR || path.join(process.cwd(), 'data'));
const configuredSetupToken = process.env.HKDPLUS_SETUP_TOKEN?.trim() || '';
export const MIN_PASSWORD_LENGTH = 10;
const insecureSecretPattern = /your-super-secret|change[-_ ]?this|fallback[-_ ]?secret|admin123|password|replace[-_ ]?with|__.*__/i;

if (DATABASE_PROVIDER === 'postgres' && process.env.NODE_ENV === 'production') {
  const configuredPostgresPassword = process.env.POSTGRES_PASSWORD?.trim() || '';
  if (!configuredPostgresPassword || insecureSecretPattern.test(configuredPostgresPassword)) {
    throw new Error('POSTGRES_PASSWORD phải được cấu hình bằng secret riêng, không dùng placeholder.');
  }
}

if (configuredSetupToken && configuredSetupToken.length < 32) {
  throw new Error('HKDPLUS_SETUP_TOKEN phải có ít nhất 32 ký tự.');
}
if (configuredSetupToken && process.env.NODE_ENV === 'production' && insecureSecretPattern.test(configuredSetupToken)) {
  throw new Error('HKDPLUS_SETUP_TOKEN đang dùng giá trị mặc định không an toàn.');
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

const loadOrCreateSecret = (environmentName: string, fileName: string) => {
  const configured = process.env[environmentName]?.trim();
  if (configured) {
    if (configured.length < 32) {
      throw new Error(`${environmentName} phải có ít nhất 32 ký tự.`);
    }
    if (process.env.NODE_ENV === 'production' && insecureSecretPattern.test(configured)) {
      throw new Error(`${environmentName} đang dùng giá trị mặc định không an toàn.`);
    }
    return configured;
  }

  const secretPath = path.join(DATA_DIR, fileName);
  if (fs.existsSync(secretPath)) {
    const persisted = fs.readFileSync(secretPath, 'utf8').trim();
    if (persisted.length >= 32) {
      fs.chmodSync(secretPath, 0o600);
      return persisted;
    }
    throw new Error(`Secret trong ${secretPath} không hợp lệ. Hãy tạo lại instance hoặc cấu hình ${environmentName}.`);
  }

  const generated = crypto.randomBytes(48).toString('base64url');
  const descriptor = fs.openSync(secretPath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${generated}\n`, { encoding: 'utf8' });
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(secretPath, 0o600);
  return generated;
};

export const SETUP_TOKEN = OFFLINE_MODE
  ? loadOrCreateSecret('HKDPLUS_SETUP_TOKEN', '.setup-token')
  : configuredSetupToken;
export const SETUP_TOKEN_GENERATED = OFFLINE_MODE && !configuredSetupToken;
export const JWT_SECRET = loadOrCreateSecret('JWT_SECRET', '.jwt-secret');
export const INSTANCE_SECRET = loadOrCreateSecret('HKDPLUS_INSTANCE_SECRET', '.instance-secret');
export const INSTANCE_ID = loadOrCreateSecret('HKDPLUS_INSTANCE_ID', '.instance-id').slice(0, 32);

export const isLoopbackRequest = (address?: string | null) => {
  const normalized = String(address || '').replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
};

export const isAllowedSetupRequest = (address?: string | null, providedToken?: string | null) => {
  if (isLoopbackRequest(address)) return true;
  if (!SETUP_TOKEN || !providedToken || providedToken.length !== SETUP_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(SETUP_TOKEN));
};

export const allowedCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
