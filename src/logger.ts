import type { AppConfig } from './config.js';

type Level = AppConfig['LOG_LEVEL'];

const order: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(level: Level) {
  const min = order[level];

  function logAt(l: Level, ...args: unknown[]) {
    if (order[l] < min) return;
    const prefix = `[${new Date().toISOString()}] [${l.toUpperCase()}]`;
    if (l === 'error') {
      console.error(prefix, ...args);
    } else if (l === 'warn') {
      console.warn(prefix, ...args);
    } else {
      console.log(prefix, ...args);
    }
  }

  return {
    debug: (...args: unknown[]) => logAt('debug', ...args),
    info: (...args: unknown[]) => logAt('info', ...args),
    warn: (...args: unknown[]) => logAt('warn', ...args),
    error: (...args: unknown[]) => logAt('error', ...args),
  };
}

export type Logger = ReturnType<typeof createLogger>;
