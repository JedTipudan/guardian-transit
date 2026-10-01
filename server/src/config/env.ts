import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

const config = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  authSecret: required(
    'AUTH_SECRET',
    nodeEnv === 'production' ? undefined : 'dev_only_insecure_secret_change_me_in_production_0123456789',
  ),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),

  otp: {
    length: Number(process.env.OTP_LENGTH ?? 6),
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30),
  },

  sms: {
    provider: (process.env.SMS_PROVIDER ?? 'dev').toLowerCase(),
    key: process.env.SMS_PROVIDER_KEY ?? '',
    secret: process.env.SMS_PROVIDER_SECRET ?? '',
    from: process.env.SMS_FROM_NUMBER ?? 'GuardianTransit',
  },

  map: {
    provider: (process.env.MAP_PROVIDER ?? 'osrm').toLowerCase(),
    apiKey: process.env.MAP_API_KEY ?? '',
    routingUrl: process.env.MAP_ROUTING_URL ?? 'https://router.project-osrm.org',
    geocodeUrl: process.env.MAP_GEOCODE_URL ?? 'https://nominatim.openstreetmap.org',
    tileUrl:
      process.env.MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: process.env.MAP_ATTRIBUTION ?? '© OpenStreetMap contributors',
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  },
} as const;

export type AppConfig = typeof config;
export default config;
