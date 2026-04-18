import { z } from 'zod';

const schema = z.object({
  TODOIST_API_TOKEN: z.string().min(1),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  ADVANCE_WINDOW_MS: z.coerce.number().int().positive().default(300_000),
  DEFAULT_TIMEZONE: z.string().min(1).optional(),
  STATE_GUARD_TTL_MS: z.coerce.number().int().positive().default(900_000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  return schema.parse(process.env);
}
