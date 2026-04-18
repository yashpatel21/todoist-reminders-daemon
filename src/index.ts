import 'dotenv/config';
import { TodoistApi } from '@doist/todoist-sdk';
import { loadConfig } from './config.js';
import { startDaemon } from './daemon.js';
import { createLogger } from './logger.js';

async function main() {
  const cfg = loadConfig();
  const log = createLogger(cfg.LOG_LEVEL);

  const api = new TodoistApi(cfg.TODOIST_API_TOKEN);
  const user = await api.getUser();
  const userZone = user.tzInfo.timezone;

  log.info('Todoist recurring-task daemon started', {
    pollIntervalMs: cfg.POLL_INTERVAL_MS,
    advanceWindowMs: cfg.ADVANCE_WINDOW_MS,
    userTimezone: userZone,
  });

  const { stop } = startDaemon(api, cfg, userZone, log);

  const shutdown = (signal: string) => {
    log.info(`Received ${signal}; stopping`);
    stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
