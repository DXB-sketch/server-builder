// Entry point: load .env, start the local control panel, then log the bot in.
const path = require('node:path');
const fs = require('node:fs');

const envFile = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envFile)) {
  console.warn('No .env file found — copy .env.example to .env and fill in your bot token.');
}
require('dotenv').config({ path: envFile, quiet: true });

const log = require('./logger');
const panel = require('./panel/server');
const bot = require('./bot');

process.on('unhandledRejection', (e) => log.error('Unhandled error:', e?.message || e));

panel.start();
bot.start();

// Clean shutdown (systemctl stop / restart, Ctrl+C): disconnect from Discord first.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    log.info(`${sig} received — shutting down`);
    bot.state.client?.destroy();
    setTimeout(() => process.exit(0), 300);
  });
}
