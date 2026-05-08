import React from 'react';
import { render } from 'ink';
import App from './dashboard/App';
import { log } from './utils/logger';
import { generateReport } from './execution/journal';

log('info', 'ArbiShot starting...');

const { waitUntilExit } = render(React.createElement(App));

process.on('SIGINT', () => {
  log('info', 'ArbiShot shutting down...');
  generateReport();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', 'ArbiShot terminated');
  generateReport();
  process.exit(0);
});

waitUntilExit().then(() => {
  generateReport();
  process.exit(0);
});
