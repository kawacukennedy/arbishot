# ArbiShot — Cross-Market NBA Playoffs Arbitrage Engine

## Overview

ArbiShot continuously scans Polymarket prediction markets and traditional sportsbook odds, detects pricing gaps (pure arbitrage and value signals), sizes positions with the Kelly criterion, and executes paper trades while displaying a live terminal dashboard.

Built for the [DEGA NBA Playoffs Prediction Market Hackathon](https://dorahacks.io/hackathon/nba-prediction-market/detail).

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys:
#   ODDS_API_KEY=your_key_here

# Run in development mode
npm start

# Run tests
npm test
```

## How It Works

```
Polymarket Gamma API ─┐
Polymarket CLOB API  ─┤
                      ├──→ Normalize → Match → Detect → Risk Gate → Paper Trade → TUI Dashboard
The Odds API ─────────┘
```

### Strategies

1. **Pure Arbitrage**: Buy YES + NO on Polymarket when combined cost < $1.00 (after fees). Guaranteed profit.
2. **Value**: Buy when Polymarket price diverges from sportsbook consensus probability.
3. **Momentum (stub)**: Exploit Polymarket lag after Game 1 upsets.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ODDS_API_KEY` | _(required)_ | The Odds API free tier key |
| `SCAN_INTERVAL_MS` | 15000 | Scan cycle interval |
| `KELLY_FRACTION` | 0.25 | Fractional Kelly (0.25 = quarter Kelly) |
| `MAX_POSITION_SIZE` | 100 | Max paper dollars per trade |
| `MIN_EDGE_PCT` | 0.5 | Minimum edge percentage to trade |
| `BANKROLL` | 1000 | Starting paper bankroll |
| `FEE_RATE` | 0.005 | Taker fee rate (0.5%) |

## Running

```bash
# Via ts-node (no Canon required)
npm start

# With Canon CLI
canon start
```

## Project Structure

```
arbishot/
├── src/
│   ├── config.ts              # Environment config
│   ├── types.ts               # Shared TypeScript interfaces
│   ├── index.ts               # Entry point, boots Ink TUI
│   ├── fetchers/              # API data ingestion
│   ├── normalizers/           # Odds → probability conversion
│   ├── matchers/              # Cross-platform event matching
│   ├── detectors/             # Arb, value, momentum signals
│   ├── risk/                  # Kelly sizing, cooldown, drawdown
│   ├── execution/             # Paper trading, P&L journal
│   └── dashboard/             # Ink/React TUI components
├── tests/                     # Jest test suite
├── canon.config.ts            # Canon CLI configuration
└── .env.example               # Environment variable template
```

## API Keys

- [The Odds API](https://the-odds-api.com/) — Free tier: 500 requests/month
- Polymarket APIs — Free, no auth required for reads

## License

MIT
