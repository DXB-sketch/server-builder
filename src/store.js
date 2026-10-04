// Tiny JSON-file store for settings the panel can change at runtime
// (welcome messages, auto-roles, etc). Lives in ./data/config.json.
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'config.json');

let data = { guilds: {} };
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  data.guilds ??= {};
} catch {
  /* first run */
}

function save() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

const DEFAULT_GUILD = {
  welcome: { enabled: false, channelId: null, message: 'Welcome {user} to **{server}**! You are member #{count}.', embed: true },
  goodbye: { enabled: false, channelId: null, message: '**{username}** has left the server.' },
  autoRoles: [],
  logChannelId: null,
};

function guild(id) {
  data.guilds[id] = { ...structuredClone(DEFAULT_GUILD), ...(data.guilds[id] || {}) };
  return data.guilds[id];
}

function setGuild(id, patch) {
  data.guilds[id] = { ...guild(id), ...patch };
  save();
  return data.guilds[id];
}

module.exports = { guild, setGuild, save, get: () => data };
