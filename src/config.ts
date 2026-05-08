import dotenv from 'dotenv';

dotenv.config();

class ConfigError extends Error {
  constructor(key: string) {
    super(`Missing required environment variable: ${key}`);
    this.name = 'ConfigError';
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new ConfigError(key);
  }
  return value;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config = Object.freeze({
  oddsApiKey: requireEnv('ODDS_API_KEY'),
  polymarketGammaUrl: getEnv('POLYMARKET_GAMMA_URL', 'https://gamma-api.polymarket.com'),
  polymarketClobUrl: getEnv('POLYMARKET_CLOB_URL', 'https://clob.polymarket.com'),
  parlayApiKey: getEnv('PARLAY_API_KEY', ''),
  scanIntervalMs: getEnvNumber('SCAN_INTERVAL_MS', 15000),
  kellyFraction: getEnvNumber('KELLY_FRACTION', 0.25),
  maxPositionSize: getEnvNumber('MAX_POSITION_SIZE', 100),
  minEdgePct: getEnvNumber('MIN_EDGE_PCT', 0.5),
  cooldownMinutes: getEnvNumber('COOLDOWN_MINUTES', 5),
  bankroll: getEnvNumber('BANKROLL', 1000),
  feeRate: getEnvNumber('FEE_RATE', 0.005),
  momentumDataPath: getEnv('MOMENTUM_DATA_PATH', ''),
});

export type Config = typeof config;
