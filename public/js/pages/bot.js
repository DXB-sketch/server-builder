// Bot settings (presence, profile, welcome/goodbye, auto-roles, log channel,
// custom slash commands), raw API console and the full-page console.
import { state, api, G, h, act, toast, field, input, area, check, select, fileInput, channelSelect, loadGuildData, roleChecklist, logLine } from '../core.js';

export async function bot(root) {
  const s = state.status;
  const p = s.presence || {};
  const status = select(['online', 'idle', 'dnd', 'invisible'], p.status || 'online');
  const type = select(state.meta.activityTypes, p.type || 'Playing');
  const text = input(p.text || '', { placeholder: 'e.g. Balloon Pump 🎈' });
  const url = input(p.url || '', { placeholder: 'Twitch / YouTube URL (Streaming only)' });
  const uname = input(s.user?.username || s.user?.tag || '');
  let avatar;
  root.append(h('div.grid.g2',
    h('div.card', h('h3', '🟢 Status & activity'),
      h('div.grid.g2', field('Status', status), field('Activity type', type)), field('Activity text', text), field('Stream URL', url),
      h('div.row.end', h('button.btn.primary', { onclick: () => act(api('POST', '/bot/presence', { status: status.value, type: type.value, text: text.value, url: url.value }), 'Presence updated') }, 'Apply'))),
    h('div.card', h('h3', '🤖 Bot profile'),
      s.user && h('div.row', h('img.avatar', { src: s.user.avatar, style: { width: '56px', height: '56px' } }), h('div', h('b', s.user.tag), h('div.small.muted', s.user.id))),
      field('Username (Discord limits changes to 2 per hour)', uname), field('Avatar', fileInput((d) => (avatar = d))),
      h('div.row.end',
        h('button.btn', { onclick: () => act(api('POST', '/bot/reconnect'), 'Reconnected').then(() => setTimeout(() => location.reload(), 1500)) }, '🔄 Reconnect bot'),
        h('button.btn.primary', { onclick: () => act(api('PATCH', '/bot/profile', { username: uname.value !== s.user?.username ? uname.value : undefined, avatar }), 'Profile updated') }, 'Save profile'))),
  ));

  if (!state.guildId) return root.append(h('div.card.empty', 'Pick a server (top-right) to configure welcome messages, auto-roles and custom commands for it.'));
  await loadGuildData();
  const cfg = await api('GET', G('/botconfig'));
  const guildName = s.guilds.find((g) => g.id === state.guildId)?.name;

  const w = cfg.welcome || {};
  const wEn = check('Send a welcome message when someone joins', w.enabled);
  const wCh = channelSelect(w.channelId, { types: ['text', 'announcement'] });
  const wTitle = input(w.title || 'Welcome!');
  const wMsg = area(w.message || '', { rows: 4 });
  const wEmbed = check('Send as an embed', w.embed);
  const wColor = h('input', { type: 'color', value: w.color || '#8b5cf6' });
  const gb = cfg.goodbye || {};
  const gEn = check('Send a message when someone leaves', gb.enabled);
  const gCh = channelSelect(gb.channelId, { types: ['text', 'announcement'] });
  const gMsg = area(gb.message || '', { rows: 2 });
  const auto = roleChecklist(cfg.autoRoles || []);
  const logCh = channelSelect(cfg.logChannelId, { types: ['text'], none: '— off —' });
  const save = (patch, msg) => act(api('PUT', G('/botconfig'), patch), msg);

  root.append(
    h('div.page-title', { style: { marginTop: '22px' } }, h('h2', `Settings for ${guildName}`)),
    h('div.grid.g2',
      h('div.card', h('h3', '👋 Welcome message'), wEn, field('Channel', wCh), wEmbed, h('div.row', h('div.grow', field('Embed title', wTitle)), field('Colour', wColor)),
        field('Message', wMsg, 'Placeholders: {user} (mention), {username}, {tag}, {server}, {count}'),
        h('div.row.end', h('button.btn.primary', { onclick: () => save({ welcome: { enabled: wEn.input.checked, channelId: wCh.value || null, title: wTitle.value, message: wMsg.value, embed: wEmbed.input.checked, color: wColor.value } }, 'Welcome saved') }, 'Save'))),
      h('div.card', h('h3', '🚪 Goodbye message'), gEn, field('Channel', gCh), field('Message', gMsg, 'Placeholders: {username}, {tag}, {server}, {count}'),
        h('div.row.end', h('button.btn.primary', { onclick: () => save({ goodbye: { enabled: gEn.input.checked, channelId: gCh.value || null, message: gMsg.value } }, 'Goodbye saved') }, 'Save')),
        h('hr'), h('h3', '📋 Log channel'), h('p.small.muted', 'Joins, leaves, deleted & edited messages, bans and unbans are posted here.'), logCh,
        h('div.row.end', { style: { marginTop: '8px' } }, h('button.btn.primary', { onclick: () => save({ logChannelId: logCh.value || null }, 'Log channel saved') }, 'Save'))),
      h('div.card', h('h3', '🎁 Auto-roles'), h('p.small.muted', 'Given to every new member the moment they join (leave empty if you use the Verify button).'), auto,
        h('div.row.end', { style: { marginTop: '8px' } }, h('button.btn.primary', { onclick: () => save({ autoRoles: auto.value() }, 'Auto-roles saved') }, 'Save'))),
      commandsCard(cfg),
    ),
  );
}

function commandsCard(cfg) {
  const cmds = (cfg.customCommands || []).map((c) => ({ ...c }));
  const box = h('div');
  const render = () => {
    box.replaceChildren(...cmds.map((c, i) => h('div.card', { style: { background: 'var(--bg2)' } },
      h('div.row', h('b', '/'), h('input', { value: c.name, placeholder: 'name', style: { width: '150px' }, oninput: (e) => (c.name = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')) }),
        h('div.grow', h('input', { value: c.description || '', placeholder: 'Description', oninput: (e) => (c.description = e.target.value) })),
        h('button.btn.sm.danger', { onclick: () => { cmds.splice(i, 1); render(); } }, '✕')),
      h('textarea', { rows: 2, placeholder: 'Response ({user}, {username}, {server})', style: { marginTop: '6px' }, oninput: (e) => (c.response = e.target.value) }, c.response || ''),
      h('div', check('Embed', c.embed, { onchange: (e) => (c.embed = e.target.checked) }), check('Only visible to the user', c.ephemeral, { onchange: (e) => (c.ephemeral = e.target.checked) })))),
    h('button.btn.sm', { onclick: () => { cmds.push({ name: 'play', description: 'Get the game link', response: 'Play Balloon Pump here: <link>' }); render(); } }, '+ command'));
  };
  render();
  return h('div.card', h('h3', '⌨️ Custom slash commands'), h('p.small.muted', 'Simple /commands that reply with your text — e.g. /play, /codes, /group.'), box,
    h('div.row.end', { style: { marginTop: '8px' } }, h('button.btn.primary', { onclick: async () => {
      if (!(await act(api('PUT', G('/botconfig'), { customCommands: cmds.filter((c) => c.name) })))) return;
      act(api('POST', G('/commands/sync')), (r) => `Saved & registered ${r.count} command(s)`);
    } }, 'Save & register')));
}

const SNIPPETS = [
  ['Get server', 'GET', '/guilds/{guild}', ''],
  ['Get onboarding', 'GET', '/guilds/{guild}/onboarding', ''],
  ['Soundboard sounds', 'GET', '/guilds/{guild}/soundboard-sounds', ''],
  ['Get vanity URL', 'GET', '/guilds/{guild}/vanity-url', ''],
  ['Guild integrations', 'GET', '/guilds/{guild}/integrations', ''],
  ['Voice regions', 'GET', '/guilds/{guild}/regions', ''],
  ['Guild slash commands', 'GET', '/applications/{app}/guilds/{guild}/commands', ''],
  ['Global slash commands', 'GET', '/applications/{app}/commands', ''],
  ['Edit member (raw)', 'PATCH', '/guilds/{guild}/members/USER_ID', '{\n  "nick": "New nick"\n}'],
  ['Edit onboarding', 'PUT', '/guilds/{guild}/onboarding', '{\n  "enabled": true,\n  "mode": 0,\n  "default_channel_ids": [],\n  "prompts": []\n}'],
];

export async function raw(root) {
  const fillVars = (s) => s.replace('{guild}', state.guildId || 'GUILD_ID').replace('{app}', state.status?.user?.id || 'APP_ID');
  const method = select(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], 'GET', { style: { width: '110px' } });
  const route = input(fillVars('/guilds/{guild}'), { class: 'mono' });
  const body = area('', { class: 'code', style: { minHeight: '180px' }, placeholder: 'JSON body (for POST / PUT / PATCH)' });
  const reason = input('', { placeholder: 'Audit-log reason (optional)' });
  const out = h('pre.mono', { style: { whiteSpace: 'pre-wrap', maxHeight: '60vh', overflow: 'auto', background: 'var(--bg)', padding: '12px', borderRadius: '8px', margin: 0 } }, '—');
  const send = async () => {
    let b;
    if (body.value.trim()) {
      try { b = JSON.parse(body.value); } catch (e) { return toast('Body is not valid JSON: ' + e.message, true); }
    }
    out.textContent = '…';
    try {
      const r = await api('POST', '/raw', { method: method.value, route: route.value, body: b, reason: reason.value || undefined });
      out.textContent = JSON.stringify(r.result, null, 2);
      out.style.color = '';
    } catch (e) {
      out.textContent = e.message + (e.detail ? '\n\n' + e.detail : '');
      out.style.color = 'var(--err)';
    }
  };
  route.addEventListener('keydown', (e) => e.key === 'Enter' && send());
  root.append(
    h('div.banner', '🧪 Direct access to ', h('b', 'every'), ' Discord API endpoint, sent as the bot. Anything Discord lets a bot do but that has no button elsewhere in this panel can be done here. ',
      h('a', { href: 'https://discord.com/developers/docs/resources/guild', target: '_blank' }, 'API reference ↗')),
    h('div.split',
      h('div.card', h('h3', 'Snippets'), h('div.list', SNIPPETS.map(([n, m, r, b]) => h('div.item', { onclick: () => { method.value = m; route.value = fillVars(r); body.value = b; } }, h('span.tag', m), h('span.name', n))))),
      h('div',
        h('div.card', h('div.row', method, h('div.grow', route), h('button.btn.primary', { onclick: send }, 'Send')), h('div', { style: { marginTop: '10px' } }, body), h('div', { style: { marginTop: '8px' } }, reason)),
        h('div.card', h('h3', 'Response'), out))),
  );
}

export async function logs(root) {
  const box = h('div.bigLog', { id: 'bigLog', style: { overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: '12px', background: '#0a0b0e', padding: '10px', borderRadius: '8px' } });
  (await api('GET', '/logs')).forEach((e) => logLine(e, box));
  const fn = (e) => (document.body.contains(box) ? logLine(e, box) : window.logListeners.delete(fn));
  window.logListeners.add(fn);
  root.append(h('div.card', h('h3', h('span.grow', '🖥️ Live console'), h('button.btn.sm', { onclick: () => box.replaceChildren() }, 'Clear view')), box));
  setTimeout(() => (box.scrollTop = box.scrollHeight));
}
