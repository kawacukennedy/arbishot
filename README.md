# ArbiShot — Cross-Market NBA Arbitrage Engine

ArbiShot continuously scans Polymarket prediction markets, Manifold Markets, and traditional sportsbook odds to detect pricing gaps. It supports pure arbitrage, value signals, and championship futures — sizing positions with the Kelly criterion and executing paper trades on a live terminal dashboard.

## Quick Start

```bash
npm install
cp .env.example .env    # edit ODDS_API_KEY
npm start               # launch dashboard
npm test                # run test suite
```

## Data Sources

| Source | Data | Auth |
|--------|------|------|
| Polymarket Gamma API | NBA Finals, Conference, MVP binary markets | None |
| Polymarket CLOB API | Real-time order book depth | None |
| Manifold Markets | NBA playoff prediction markets | None |
| The Odds API | Game moneylines (8-9 books) | Free tier key |
| The Odds API (outrights) | NBA Championship winner futures | Free tier key |
| ParlayAPI | Alternative sportsbook feed | Optional key |

## How It Works

```
                    ┌──────────────────┐
                    │  Polymarket      │
                    │  Gamma + CLOB    │──┐
                    └──────────────────┘  │
                                          ├──→ Normalize → Match → Detect
                    ┌──────────────────┐  │         ↓
                    │  Manifold        │──┘    Kelly Size
                    └──────────────────┘         ↓
                                          Paper Trade
                    ┌──────────────────┐         ↓
                    │  The Odds API    │──┐   TUI Dashboard
                    │  (games + champ) │  │
                    └──────────────────┘  │
                                          │
                    ┌──────────────────┐  │
                    │  ParlayAPI       │──┘
                    └──────────────────┘
```

### Strategies

1. **Pure Arbitrage** — Buy YES + NO on Polymarket when combined ask < $1 after fees
2. **Value** — Mispricing between prediction market price and sportsbook consensus/de-vigged probability
3. **Championship Futures** — Single-team "Will X win the Finals?" vs sportsbook championship outrights
4. **Momentum** (stub) — Exploit Polymarket lag after playoff upsets

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ODDS_API_KEY` | _(required)_ | The Odds API key |
| `SCAN_INTERVAL_MS` | 15000 | Scan cycle interval (ms) |
| `KELLY_FRACTION` | 0.25 | Fractional Kelly |
| `MAX_POSITION_SIZE` | 100 | Max paper $ per trade |
| `MIN_EDGE_PCT` | 0.5 | Minimum edge to trade |
| `COOLDOWN_MINUTES` | 5 | Cooldown between trades |
| `BANKROLL` | 1000 | Starting paper bankroll |
| `FEE_RATE` | 0.005 | Taker fee (0.5%) |

## Project Structure

```
src/
├── config.ts              # Env loading
├── types.ts               # Shared interfaces
├── index.ts               # Entry point (Ink TUI)
├── fetchers/              # API ingestion (5 sources)
├── normalizers/           # Odds → probability math
├── matchers/              # Cross-platform event matching
├── aggregators/           # Consensus computation
├── detectors/             # Pure arb, value, momentum
├── risk/                  # Kelly sizing
├── execution/             # Paper engine & journal
└── dashboard/             # React/Ink TUI
tests/                     # Jest
```

## License

MIT
