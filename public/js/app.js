// App shell: navigation, server picker, bot status and the live console.
import { state, api, h, toast, showLogin, logLine } from './core.js';
import pages from './pages/index.js';

const NAV = [
  ['Build', [
    ['dashboard', '🚀', 'Dashboard'],
    ['templates', '📐', 'Templates'],
  ]],
  ['Server', [
    ['server', '⚙️', 'Server Settings'],
    ['roles', '🎭', 'Roles'],
    ['channels', '#️⃣', 'Channels'],
    ['messages', '💬', 'Messages & Embeds'],
    ['threads', '🧵', 'Threads & Forums'],
  ]],
  ['People', [
    ['members', '👥', 'Members'],
    ['bans', '🔨', 'Bans & Prune'],
  ]],
  ['Moderation', [
    ['automod', '🛡️', 'AutoMod'],
    ['audit', '📜', 'Audit Log'],
  ]],
  ['Extras', [
    ['events', '📅', 'Events'],
    ['emojis', '😀', 'Emojis & Stickers'],
    ['invites', '🔗', 'Invites'],
    ['webhooks', '🪝', 'Webhooks'],
  ]],
  ['Bot', [
    ['bot', '🤖', 'Bot Settings'],
    ['raw', '🧪', 'Raw API'],
    ['logs', '🖥️', 'Console'],
  ]],
];

const nav = document.getElementById('nav');
for (const [sec, items] of NAV) {
  nav.append(h('div.sec', sec));
  for (const [id, ico, label] of items) nav.append(h('a', { href: '#/' + id, 'data-id': id }, h('span.ico', ico), label));
}

const main = document.getElementById('main');
let renderSeq = 0;
async function route() {
  const id = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  const page = pages[id] || pages.dashboard;
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.id === id));
  const label = NAV.flatMap((s) => s[1]).find((x) => x[0] === id)?.[2] || 'Dashboard';
  document.getElementById('title').textContent = label;
  const seq = ++renderSeq;
  main.replaceChildren(h('div.empty', 'Loading…'));
  const root = h('div');
  try {
    await page(root);
    if (seq === renderSeq) main.replaceChildren(root);
  } catch (e) {
    if (seq === renderSeq) main.replaceChildren(h('div.banner.err', h('b', 'Could not load this page: '), e.message));
  }
}
window.addEventListener('hashchange', route);
window.rerender = route;

// ── server picker + status ──
const pick = document.getElementById('guildPick');
pick.addEventListener('change', () => {
  state.guildId = pick.value;
  localStorage.setItem('guildId', pick.value);
  state._loadedFor = null;
  route();
});

async function refreshStatus(first = false) {
  try {
    const s = await api('GET', '/status');
    const changed = JSON.stringify(s.guilds) !== JSON.stringify(state.status?.guilds);
    state.status = s;
    const pill = document.getElementById('botPill');
    pill.replaceChildren(
      h('span.dot' + (s.ready ? '.on' : '.off')),
      s.ready ? `${s.user.tag} · ${s.ping}ms` : s.error ? 'Offline — see console' : 'Connecting…',
    );
    if (changed || first) {
      const names = { [s.env.COMMUNITY_GUILD_ID]: ' (Community)', [s.env.GAME_GUILD_ID]: ' (Game)' };
      pick.replaceChildren(
        h('option', { value: '' }, s.guilds.length ? '— choose a server —' : '— bot is in no servers —'),
        ...s.guilds.map((g) => h('option', { value: g.id, selected: g.id === state.guildId }, g.name + (names[g.id] || ''))),
      );
      if (state.guildId && !s.guilds.some((g) => g.id === state.guildId)) {
        state.guildId = '';
      }
      if (!state.guildId && s.guilds.length) {
        state.guildId = s.env.COMMUNITY_GUILD_ID && s.guilds.some((g) => g.id === s.env.COMMUNITY_GUILD_ID) ? s.env.COMMUNITY_GUILD_ID : s.guilds[0].id;
        pick.value = state.guildId;
      }
      if (!first && changed) route();
    }
  } catch (e) {
    document.getElementById('botPill').replaceChildren(h('span.dot.off'), 'Panel offline');
  }
}

// ── console ──
const box = document.getElementById('logBox');
const con = document.getElementById('console');
document.getElementById('consoleHead').addEventListener('click', () => con.classList.toggle('collapsed'));
window.logListeners = new Set();
function connectStream() {
  const es = new EventSource('/api/stream' + (state.token ? `?token=${state.token}` : ''));
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    logLine(e);
    document.getElementById('lastLog').textContent = e.msg.slice(0, 140);
    window.logListeners.forEach((fn) => fn(e));
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectStream, 3000);
  };
}

(async () => {
  const auth = await fetch('/api/auth', { headers: { 'x-panel-token': state.token } }).then((r) => r.json()).catch(() => ({}));
  if (auth.required && !auth.ok) return showLogin();
  state.meta = await api('GET', '/meta').catch(() => null);
  const hist = await api('GET', '/logs').catch(() => []);
  hist.forEach((e) => logLine(e));
  box.scrollTop = box.scrollHeight;
  connectStream();
  await refreshStatus(true);
  route();
  setInterval(refreshStatus, 5000);
})().catch((e) => toast(e.message, true));
