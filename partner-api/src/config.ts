import { z } from 'zod';

const DEV_DEFAULTS = {
  JWT_SECRET: 'dev-only-change-me-to-a-long-random-string',
  API_KEY_PEPPER: 'dev-only-pepper-change-me',
  PARTNER_ADMIN_TOKEN: 'dev-admin-token',
};

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(32).default(DEV_DEFAULTS.JWT_SECRET),
  API_KEY_PEPPER: z.string().min(16).default(DEV_DEFAULTS.API_KEY_PEPPER),
  PARTNER_ADMIN_TOKEN: z.string().min(12).default(DEV_DEFAULTS.PARTNER_ADMIN_TOKEN),
  TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  TOKEN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  SETTLE_AFTER_MS: z.coerce.number().int().min(0).default(15_000),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = schema.parse(env);
  if (config.NODE_ENV === 'production') {
    const insecure = (Object.keys(DEV_DEFAULTS) as (keyof typeof DEV_DEFAULTS)[]).filter(
      (key) => config[key] === DEV_DEFAULTS[key],
    );
    if (insecure.length) throw new Error(`Set real values for ${insecure.join(', ')} in production`);
  }
  return config;
}

/** A config for tests: no environment needed. */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return schema.parse({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused', ...overrides });
}
