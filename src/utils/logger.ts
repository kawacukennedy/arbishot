import { LogLevel } from '../types';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function timestamp(): string {
  return new Date().toISOString();
}

export function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

  const prefix = level.toUpperCase().padEnd(5);
  const msg = `[${timestamp()}] ${prefix} ${message}`;

  switch (level) {
    case 'error':
      console.error(msg, ...args);
      break;
    case 'warn':
      console.warn(msg, ...args);
      break;
    default:
      console.log(msg, ...args);
  }
}
