// Local web control panel: serves the GUI from /public and the JSON API under /api.
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const log = require('../logger');
const api = require('./api');

const tokens = new Set();

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function openBrowser(url) {
  const { exec } = require('node:child_process');
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {}); // best effort — ignore failures (e.g. no desktop)
}

function start() {
  const host = process.env.PANEL_HOST || '127.0.0.1';
  const port = Number(process.env.PANEL_PORT || 3000);
  const password = process.env.PANEL_PASSWORD || '';
  const app = express();
  app.disable('x-powered-by');

  // Without a password, only answer requests addressed to this machine
  // (blocks DNS-rebinding attacks from websites you visit).
  app.use((req, res, next) => {
    if (password) return next();
    const h = (req.hostname || '').toLowerCase();
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(h)) return next();
    res.status(403).send('Panel is only reachable via localhost. Set PANEL_PASSWORD in .env to allow other hosts.');
  });

  app.use(express.json({ limit: '25mb' }));
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));

  app.get('/api/auth', (req, res) => res.json({ required: !!password, ok: !password || tokens.has(req.get('x-panel-token')) }));
  app.post('/api/login', (req, res) => {
    if (!password) return res.json({ token: '' });
    if (!safeEqual(req.body?.password ?? '', password)) return res.status(401).json({ error: 'Wrong password' });
    const t = crypto.randomBytes(24).toString('hex');
    tokens.add(t);
    res.json({ token: t });
  });

  app.use('/api', (req, res, next) => {
    // A custom header can't be sent cross-site without a CORS preflight (which we never allow).
    if (req.method !== 'GET' && req.get('x-panel') !== '1') return res.status(403).json({ error: 'Missing x-panel header' });
    if (password && !tokens.has(req.get('x-panel-token') || req.query.token)) return res.status(401).json({ error: 'Not logged in' });
    next();
  });

  // Live log stream (Server-Sent Events)
  app.get('/api/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    log.bus.on('log', send);
    req.on('close', () => {
      clearInterval(ping);
      log.bus.off('log', send);
    });
  });
  app.get('/api/logs', (req, res) => res.json(log.history));

  app.use('/api', api);

  app.use('/api', (req, res) => res.status(404).json({ error: `No API route ${req.method} ${req.path}` }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : err.type === 'entity.parse.failed' ? 400 : 500;
    const msg = err.rawError?.message ? `${err.rawError.message}${err.code ? ` (code ${err.code})` : ''}` : err.message;
    const detail = err.rawError?.errors ? JSON.stringify(err.rawError.errors) : undefined;
    if (status >= 500 && status !== 503) log.error(`${req.method} ${req.path}: ${msg}`);
    res.status(status).json({ error: msg, detail });
  });

  const server = app.listen(port, host, () => {
    const shown = host === '0.0.0.0' ? 'localhost' : host;
    const url = `http://${shown}:${port}`;
    log.ok(`Control panel running → ${url}`);
    if (process.env.OPEN_BROWSER !== 'false') openBrowser(url);
    if (host !== '127.0.0.1' && host !== 'localhost' && !password) {
      log.warn('PANEL_HOST is not localhost and PANEL_PASSWORD is empty — anyone on your network could control the bot!');
    }
  });
  server.on('error', (e) => log.error(`Panel could not start on ${host}:${port} — ${e.message}`));
  return server;
}

module.exports = { start };
