export default {
  name: 'arbishot',
  description: 'Cross-market NBA Playoffs arbitrage engine scanning Polymarket and sportsbooks',
  agents: {
    marketAnalyst: {
      provider: 'openai',
      model: 'gpt-4o',
      prompt: 'Analyze NBA Playoffs prediction markets and sportsbook odds for arbitrage opportunities.',
    },
  },
  ui: 'tui' as const,
  entry: 'src/index.ts',
};
