const { EventEmitter } = require('node:events');

const bus = new EventEmitter();
bus.setMaxListeners(100);
const history = [];
const MAX = 1000;

function emit(level, args) {
  const msg = args
    .map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  const entry = { time: new Date().toISOString(), level, msg };
  history.push(entry);
  if (history.length > MAX) history.shift();
  const line = `[${entry.time.slice(11, 19)}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  (level === 'error' ? console.error : console.log)(line);
  bus.emit('log', entry);
}

module.exports = {
  bus,
  history,
  info: (...a) => emit('info', a),
  ok: (...a) => emit('ok', a),
  warn: (...a) => emit('warn', a),
  error: (...a) => emit('error', a),
};
