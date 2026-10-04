// Server settings, roles and channels pages.
import {
  state, api, G, h, act, toast, modal, confirmDanger, prompt, field, input, num, area, check, select, fileInput,
  channelSelect, loadGuildData, permChecklist, permTriState, typeIcon, needGuild, fmtDate,
} from '../core.js';

// ───────────────────────────── server settings ─────────────────────────────
export async function server(root) {
  if (needGuild(root)) return;
  await loadGuildData(true);
  const g = await api('GET', G());
  const m = state.meta;
  const imgs = {};
  const imgField = (key, label, url) => {
    const prev = h('img', { src: url || '', style: { maxHeight: '64px', maxWidth: '200px', borderRadius: '8px', display: url ? '' : 'none' } });
    return field(label, h('div.row', prev, fileInput((d) => { imgs[key] = d; prev.src = d; prev.style.display = ''; }),
      url && h('button.btn.sm.danger', { onclick: () => { imgs[key] = null; prev.style.display = 'none'; } }, 'Remove')));
  };
  const f = {
    name: input(g.name),
    description: area(g.description || '', { rows: 2 }),
    preferredLocale: input(g.preferredLocale),
    premiumProgressBarEnabled: check('Show boost progress bar', g.premiumProgressBarEnabled),
    verificationLevel: select(m.verificationLevel, g.verificationLevel),
    defaultMessageNotifications: select(m.defaultMessageNotifications, g.defaultMessageNotifications),
    explicitContentFilter: select(m.explicitContentFilter, g.explicitContentFilter),
    community: check('Community server (needed for announcement / stage / forum channels, welcome screen, discovery)', g.community),
    systemChannel: channelSelect(g.systemChannelId, { types: ['text'] }),
    rulesChannel: channelSelect(g.rulesChannelId, { types: ['text'] }),
    publicUpdatesChannel: channelSelect(g.publicUpdatesChannelId, { types: ['text'] }),
    safetyAlertsChannel: channelSelect(g.safetyAlertsChannelId, { types: ['text'] }),
    afkChannel: channelSelect(g.afkChannelId, { types: ['voice'] }),
    afkTimeout: select([[60, '1 minute'], [300, '5 minutes'], [900, '15 minutes'], [1800, '30 minutes'], [3600, '1 hour']], g.afkTimeout),
  };
  const flags = m.systemChannelFlags.map((fl) => {
    const c = check(fl.replace(/([a-z])([A-Z])/g, '$1 $2'), g.systemChannelFlags.includes(fl));
    c.input.value = fl;
    return c;
  });

  const save = async () => {
    const body = {
      name: f.name.value,
      description: f.description.value,
      preferredLocale: f.preferredLocale.value,
      premiumProgressBarEnabled: f.premiumProgressBarEnabled.input.checked,
      verificationLevel: f.verificationLevel.value,
      defaultMessageNotifications: f.defaultMessageNotifications.value,
      explicitContentFilter: f.explicitContentFilter.value,
      systemChannel: f.systemChannel.value,
      afkChannel: f.afkChannel.value,
      afkTimeout: f.afkTimeout.value,
      systemChannelFlags: flags.filter((c) => c.input.checked).map((c) => c.input.value),
      ...imgs,
    };
    if (f.community.input.checked !== g.community) body.community = f.community.input.checked;
    if (g.community || f.community.input.checked) {
      body.rulesChannel = f.rulesChannel.value;
      body.publicUpdatesChannel = f.publicUpdatesChannel.value;
      if (f.safetyAlertsChannel.value) body.safetyAlertsChannel = f.safetyAlertsChannel.value;
    }
    if (await act(api('PATCH', G(), body), 'Server settings saved')) window.rerender();
  };

  root.append(
    h('div.page-title', h('h2', g.icon && h('img.avatar', { src: g.icon, style: { width: '36px', height: '36px', marginRight: '10px', verticalAlign: 'middle' } }), g.name),
      h('button.btn.primary', { onclick: save }, '💾 Save settings')),
    h('div.row', { style: { marginBottom: '14px' } },
      h('span.tag', `ID ${g.id}`), h('span.tag', `${g.memberCount} members`), h('span.tag', `Boost tier ${g.premiumTier} (${g.premiumSubscriptionCount} boosts)`),
      h('span.tag', `${g.counts.channels} channels`), h('span.tag', `${g.counts.roles} roles`), h('span.tag', `Created ${fmtDate(g.createdAt)}`),
      g.community && h('span.tag.ok', 'Community')),
    h('div.grid.g2',
      h('div.card', h('h3', '🏷️ Identity'),
        field('Server name', f.name), field('Description', f.description),
        imgField('icon', 'Icon', g.icon), imgField('banner', 'Banner (boost level 2)', g.banner), imgField('splash', 'Invite splash (boost level 1)', g.splash),
        field('Preferred locale', f.preferredLocale, 'e.g. en-US, en-GB'), f.premiumProgressBarEnabled),
      h('div.card', h('h3', '🛡️ Safety'),
        field('Verification level', f.verificationLevel, 'Medium = must be registered on Discord for 5+ minutes'),
        field('Default notifications', f.defaultMessageNotifications, 'OnlyMentions is recommended for big servers'),
        field('Explicit media filter', f.explicitContentFilter),
        f.community,
        h('hr'), h('h3', '📍 Special channels'),
        field('System messages channel', f.systemChannel), h('div', flags),
        field('Rules channel (Community)', f.rulesChannel), field('Community updates channel (Community)', f.publicUpdatesChannel),
        field('Safety alerts channel (Community)', f.safetyAlertsChannel),
        h('div.row', h('div.grow', field('AFK voice channel', f.afkChannel)), h('div.grow', field('AFK timeout', f.afkTimeout)))),
    ),
    h('div.card', h('h3', 'Features'), h('div.row', g.features.map((x) => h('span.tag', x)))),
  );

  // Welcome screen
  if (g.community) {
    const ws = await api('GET', G('/welcome-screen')).catch(() => ({ enabled: false, description: '', channels: [] }));
    const en = check('Enabled', ws.enabled);
    const desc = area(ws.description || '', { rows: 2 });
    const rows = [];
    const rowsBox = h('div');
    const addRow = (c = {}) => {
      if (rows.length >= 5) return toast('Max 5 channels', true);
      const r = { channel: channelSelect(c.channel), description: input(c.description || '', { placeholder: 'Description' }), emoji: input(c.emoji || '', { placeholder: '😀', style: { width: '70px' } }) };
      rows.push(r);
      rowsBox.append(h('div.row', { style: { marginBottom: '6px' } }, h('div.grow', r.channel), h('div.grow', r.description), r.emoji));
    };
    ws.channels.forEach(addRow);
    root.append(h('div.card', h('h3', '👋 Welcome screen'), h('p.small.muted', 'Shown to new members when they join a Community server.'),
      en, field('Description', desc), rowsBox,
      h('div.row', h('button.btn.sm', { onclick: () => addRow() }, '+ channel'), h('span.grow'),
        h('button.btn.primary', { onclick: () => act(api('PATCH', G('/welcome-screen'), { enabled: en.input.checked, description: desc.value,
          channels: rows.map((r) => ({ channel: r.channel.value, description: r.description.value, emoji: r.emoji.value })) }), 'Welcome screen saved') }, 'Save welcome screen'))));
  }

  // Widget
  const w = await api('GET', G('/widget')).catch(() => null);
  if (w) {
    const en = check('Enable server widget', w.enabled);
    const ch = channelSelect(w.channelId, { types: ['text'], none: '— no invite channel —' });
    root.append(h('div.card', h('h3', '🧩 Server widget'), en, field('Invite channel', ch),
      h('div.row.end', h('button.btn', { onclick: () => act(api('PATCH', G('/widget'), { enabled: en.input.checked, channelId: ch.value }), 'Widget saved') }, 'Save widget'))));
  }

  root.append(h('div.card', h('h3', '⚠️ Danger zone'),
    h('div.row', h('span.grow', 'Make the bot leave this server.'),
      h('button.btn.danger', { onclick: async () => {
        if (await confirmDanger(`The bot will leave "${g.name}".`, g.name)) await act(api('POST', G('/leave')), 'Left server');
      } }, 'Leave server'))));
}

// ───────────────────────────── roles ─────────────────────────────
export async function roles(root) {
  if (needGuild(root)) return;
  await loadGuildData(true);
  let sel = location.hash.split('?')[1];
  const left = h('div.card', h('h3', h('span.grow', `Roles (${state.roles.length})`),
    h('button.btn.sm.primary', { onclick: async () => {
      const name = await prompt('New role', 'Role name', 'new role');
      if (!name) return;
      const r = await act(api('POST', G('/roles'), { name, permissions: [] }), 'Role created');
      if (r) location.hash = `#/roles?${r.id}`;
    } }, '+ New')));
  const list = h('div.list');
  left.append(h('p.small.muted', 'Highest role first. Use ▲▼ to reorder.'), list);
  const ids = state.roles.filter((r) => !r.everyone).map((r) => r.id);
  const move = async (id, d) => {
    const i = ids.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    if (await act(api('POST', G('/roles/order'), { ids }), 'Reordered')) window.rerender();
  };
  for (const r of state.roles) {
    list.append(h('div.item', { class: r.id === sel ? 'sel' : '', onclick: () => (location.hash = `#/roles?${r.id}`) },
      h('span.swatch', { style: { background: r.color === '#000000' ? '#99aab5' : r.color } }),
      h('span.name', r.everyone ? '@everyone' : r.name),
      r.managed && h('span.tag', 'bot'), !r.editable && !r.everyone && h('span.tag.err', '🔒'),
      h('span.tag', r.members),
      !r.everyone && h('button.btn.ghost.sm', { title: 'Move up', onclick: (e) => { e.stopPropagation(); move(r.id, -1); } }, '▲'),
      !r.everyone && h('button.btn.ghost.sm', { title: 'Move down', onclick: (e) => { e.stopPropagation(); move(r.id, 1); } }, '▼')));
  }
  const right = h('div');
  root.append(h('div.split', left, right));
  const r = state.roles.find((x) => x.id === sel);
  if (!r) return right.append(h('div.card.empty', 'Select a role to edit it.'));

  const name = input(r.name, { disabled: r.everyone });
  const colorEl = h('input', { type: 'color', value: r.color === '#000000' ? '#99aab5' : r.color });
  const noColor = check('No colour', r.color === '#000000');
  const hoist = check('Display separately in the member list', r.hoist);
  const ment = check('Allow anyone to @mention this role', r.mentionable);
  const emoji = input(r.unicodeEmoji || '', { placeholder: 'e.g. 🎈 (needs boost level 2)', style: { width: '200px' } });
  let icon;
  const perms = permChecklist(r.permissions);
  const target = select([['humans', 'all humans'], ['bots', 'all bots'], ['all', 'everyone']], 'humans');
  right.append(
    h('div.card',
      h('h3', h('span.swatch', { style: { background: r.color } }), h('span.grow', r.everyone ? '@everyone' : r.name), h('code', r.id)),
      !r.editable && h('div.banner', 'This role is above (or equal to) the bot\'s highest role, so the bot cannot edit it. Drag the bot\'s role higher in Discord.'),
      h('div.grid.g2',
        h('div', field('Name', name), field('Colour', h('div.row', colorEl, noColor))),
        h('div', !r.everyone && hoist, !r.everyone && ment, !r.everyone && field('Role emoji / icon', h('div.row', emoji, fileInput((d) => (icon = d))))),
      ),
      h('div.row.end',
        !r.everyone && !r.managed && h('button.btn.danger', { onclick: async () => {
          if (await confirmDanger(`Delete role "${r.name}"?`)) if (await act(api('DELETE', G(`/roles/${r.id}`)), 'Role deleted')) location.hash = '#/roles';
        } }, 'Delete'),
        h('button.btn.primary', { onclick: async () => {
          const body = { permissions: perms.value() };
          if (!r.everyone) Object.assign(body, { name: name.value, color: noColor.input.checked ? 0 : colorEl.value, hoist: hoist.input.checked, mentionable: ment.input.checked, unicodeEmoji: emoji.value });
          if (icon) body.icon = icon;
          if (await act(api('PATCH', G(`/roles/${r.id}`), body), 'Role saved')) window.rerender();
        } }, '💾 Save role'),
      ),
    ),
    h('div.card', h('h3', 'Permissions'), perms),
    !r.everyone && h('div.card', h('h3', 'Mass assign'),
      h('div.row', 'Give / take this role to', target,
        h('button.btn', { onclick: async () => (await confirmDanger(`Add ${r.name} to ${target.value}?`)) && act(api('POST', G(`/roles/${r.id}/mass`), { action: 'add', target: target.value }), (x) => `Added to ${x.count} member(s)`) }, 'Add to all'),
        h('button.btn', { onclick: async () => (await confirmDanger(`Remove ${r.name} from ${target.value}?`)) && act(api('POST', G(`/roles/${r.id}/mass`), { action: 'remove', target: target.value }), (x) => `Removed from ${x.count} member(s)`) }, 'Remove from all'))),
  );
}

// ───────────────────────────── channels ─────────────────────────────
function overwriteEditor(ch) {
  const box = h('div');
  const rows = ch.overwrites.map((o) => ({ ...o }));
  let active = rows[0]?.id;
  const render = () => {
    box.replaceChildren();
    const tabs = h('div.row', { style: { marginBottom: '10px' } });
    for (const o of rows) {
      tabs.append(h('button.btn.sm' + (o.id === active ? '.primary' : ''), { onclick: () => { save(); active = o.id; render(); } }, o.type === 1 ? '👤 ' : '', o.name || o.id));
    }
    const add = select([['', '+ add role…'], ...state.roles.filter((r) => !rows.some((o) => o.id === r.id)).map((r) => [r.id, r.everyone ? '@everyone' : r.name])], '', {
      style: { width: 'auto' },
      onchange: () => {
        const r = state.roles.find((x) => x.id === add.value);
        save();
        rows.push({ id: r.id, type: 0, name: r.everyone ? '@everyone' : r.name, allow: [], deny: [] });
        active = r.id;
        render();
      },
    });
    tabs.append(add);
    box.append(tabs);
    const o = rows.find((x) => x.id === active);
    if (!o) return box.append(h('p.muted', 'No permission overwrites. Add a role to customise who can see / use this channel.'));
    editor = permTriState(o.allow, o.deny);
    box.append(h('div.row', { style: { marginBottom: '8px' } }, h('b.grow', `Overwrite for ${o.name}`),
      h('button.btn.sm.danger', { onclick: () => { rows.splice(rows.indexOf(o), 1); active = rows[0]?.id; editor = null; render(); } }, 'Remove overwrite')), editor);
  };
  let editor = null;
  const save = () => {
    const o = rows.find((x) => x.id === active);
    if (o && editor) Object.assign(o, editor.value());
  };
  render();
  box.value = () => {
    save();
    return rows.map((o) => ({ id: o.id, type: o.type, allow: o.allow, deny: o.deny }));
  };
  return box;
}

export async function channels(root) {
  if (needGuild(root)) return;
  await loadGuildData(true);
  const sel = location.hash.split('?')[1];
  const cats = state.channels.filter((c) => c.type === 'category');
  const sortCh = (a, b) => (['voice', 'stage'].includes(a.type) ? 1 : 0) - (['voice', 'stage'].includes(b.type) ? 1 : 0) || a.position - b.position;
  const groups = [[null, state.channels.filter((c) => !c.parentId && c.type !== 'category').sort(sortCh)], ...cats.map((c) => [c, state.channels.filter((x) => x.parentId === c.id).sort(sortCh)])];

  const create = async (parentId = '') => {
    const nm = input('', { placeholder: 'channel-name' });
    const type = select(state.meta.channelTypes, 'text');
    const parent = select([['', '— no category —'], ...cats.map((c) => [c.id, c.name])], parentId);
    const priv = check('Private (hide from @everyone)', false);
    const ok = await modal('Create channel', h('div', field('Name', nm), field('Type', type), field('Category', parent), priv), [{ label: 'Create', value: () => true }]);
    if (!ok || !nm.value) return;
    const everyone = state.roles.find((r) => r.everyone);
    const body = { name: nm.value, type: type.value, parentId: type.value === 'category' ? undefined : parent.value || null };
    if (priv.input.checked) body.overwrites = [{ id: everyone.id, type: 0, allow: [], deny: ['ViewChannel'] }];
    const c = await act(api('POST', G('/channels'), body), 'Channel created');
    if (c) location.hash = `#/channels?${c.id}`;
  };

  const move = async (c, d) => {
    const sib = groups.find(([cat]) => (cat?.id ?? null) === (c.type === 'category' ? null : c.parentId))?.[1] || [];
    const list = c.type === 'category' ? cats.slice().sort((a, b) => a.position - b.position) : sib;
    const i = list.findIndex((x) => x.id === c.id);
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    if (await act(api('POST', G('/channels/order'), { items: list.map((x, k) => ({ id: x.id, position: k })) }), 'Moved')) window.rerender();
  };
  const item = (c, child) =>
    h('div.item' + (c.type === 'category' ? '.cat' : '') + (child ? '.child' : ''), { class: c.id === sel ? 'sel' : '', onclick: () => (location.hash = `#/channels?${c.id}`) },
      h('span', typeIcon(c.type)), h('span.name', c.name), c.synced === false && h('span.tag', { title: 'Permissions differ from category' }, '⚙'),
      h('button.btn.ghost.sm', { onclick: (e) => { e.stopPropagation(); move(c, -1); } }, '▲'),
      h('button.btn.ghost.sm', { onclick: (e) => { e.stopPropagation(); move(c, 1); } }, '▼'));
  const list = h('div.list', { style: { maxHeight: '75vh' } });
  for (const [cat, chs] of groups) {
    if (cat) list.append(item(cat, false));
    chs.forEach((c) => list.append(item(c, !!cat)));
  }
  const left = h('div.card', h('h3', h('span.grow', `Channels (${state.channels.length})`), h('button.btn.sm.primary', { onclick: () => create() }, '+ New')), list);
  const right = h('div');
  root.append(h('div.split', left, right));
  const c = state.channels.find((x) => x.id === sel);
  if (!c) return right.append(h('div.card.empty', 'Select a channel or category to edit it.'));

  const isVoice = ['voice', 'stage'].includes(c.type);
  const isForum = ['forum', 'media'].includes(c.type);
  const f = {
    name: input(c.name),
    topic: area(c.topic || '', { rows: isForum ? 4 : 2 }),
    parent: select([['', '— no category —'], ...cats.map((x) => [x.id, x.name])], c.parentId || ''),
    type: select(['text', 'announcement'], c.type),
    nsfw: check('Age-restricted (NSFW)', c.nsfw),
    slowmode: select([[0, 'Off'], [5, '5s'], [10, '10s'], [15, '15s'], [30, '30s'], [60, '1m'], [120, '2m'], [300, '5m'], [600, '10m'], [900, '15m'], [1800, '30m'], [3600, '1h'], [7200, '2h'], [21600, '6h']], c.slowmode),
    bitrate: num(c.bitrate ? c.bitrate / 1000 : 64, { min: 8, max: 384 }),
    userLimit: num(c.userLimit ?? 0, { min: 0, max: 99 }),
    defaultReaction: input(c.defaultReaction || '', { style: { width: '80px' } }),
  };
  const tags = (c.tags || []).map((t) => ({ ...t }));
  const tagBox = h('div');
  const renderTags = () => {
    tagBox.replaceChildren(...tags.map((t, i) => h('div.row', { style: { marginBottom: '4px' } },
      h('input', { value: t.emoji || '', style: { width: '60px' }, oninput: (e) => (t.emoji = e.target.value) }),
      h('input', { value: t.name, oninput: (e) => (t.name = e.target.value) }),
      check('mods only', t.moderated, { onchange: (e) => (t.moderated = e.target.checked) }),
      h('button.btn.sm.danger', { onclick: () => { tags.splice(i, 1); renderTags(); } }, '✕'))),
    h('button.btn.sm', { onclick: () => { tags.push({ name: 'New tag', emoji: '', moderated: false }); renderTags(); } }, '+ tag'));
  };
  renderTags();
  const ow = overwriteEditor(c);

  const save = async () => {
    const body = { name: f.name.value, overwrites: ow.value() };
    if (c.type !== 'category') {
      body.parentId = f.parent.value || null;
      if (!isVoice) body.topic = f.topic.value;
      body.nsfw = f.nsfw.input.checked;
      body.slowmode = f.slowmode.value;
      if (['text', 'announcement'].includes(c.type) && f.type.value !== c.type) body.type = f.type.value;
      if (isVoice) { body.bitrate = Number(f.bitrate.value) * 1000; body.userLimit = f.userLimit.value; }
      if (isForum) { body.tags = tags.filter((t) => t.name); body.defaultReaction = f.defaultReaction.value; }
    }
    if (await act(api('PATCH', G(`/channels/${c.id}`), body), 'Channel saved')) window.rerender();
  };

  const inviteOut = h('span');
  right.append(
    h('div.card',
      h('h3', typeIcon(c.type), h('span.grow', c.name), h('span.tag', c.type), h('code', c.id)),
      h('div.grid.g2',
        h('div', field('Name', f.name),
          c.type !== 'category' && field('Category', f.parent),
          ['text', 'announcement'].includes(c.type) && field('Type', f.type),
          !isVoice && c.type !== 'category' && field(isForum ? 'Post guidelines' : 'Topic', f.topic)),
        h('div',
          c.type !== 'category' && field('Slowmode', f.slowmode),
          isVoice && field('Bitrate (kbps)', f.bitrate), isVoice && field('User limit (0 = unlimited)', f.userLimit),
          c.type !== 'category' && f.nsfw,
          isForum && field('Default reaction emoji', f.defaultReaction),
          isForum && field('Forum tags', tagBox)),
      ),
      h('div.row', { style: { marginTop: '8px' } },
        c.type === 'category' && h('button.btn', { onclick: () => create(c.id) }, '+ Channel in this category'),
        c.parentId && h('button.btn', { onclick: () => act(api('POST', G(`/channels/${c.id}/sync`)), 'Permissions synced with category').then(window.rerender) }, '🔄 Sync with category'),
        !['category'].includes(c.type) && h('button.btn', { onclick: () => act(api('POST', G(`/channels/${c.id}/lockdown`), { lock: true }), 'Channel locked') }, '🔒 Lock'),
        !['category'].includes(c.type) && h('button.btn', { onclick: () => act(api('POST', G(`/channels/${c.id}/lockdown`), { lock: false }), 'Channel unlocked') }, '🔓 Unlock'),
        c.type !== 'category' && h('button.btn', { onclick: async () => {
          const r = await act(api('POST', G(`/channels/${c.id}/invites`), { maxAge: 0, maxUses: 0 }));
          if (r) inviteOut.replaceChildren(h('a', { href: r.url, target: '_blank' }, r.url));
        } }, '🔗 Permanent invite'),
        c.type === 'stage' && h('button.btn', { onclick: async () => { const t = await prompt('Start stage', 'Topic', 'Live now'); if (t) act(api('POST', G(`/channels/${c.id}/stage`), { topic: t }), 'Stage started'); } }, '🎤 Start stage'),
        c.type === 'stage' && h('button.btn', { onclick: () => act(api('DELETE', G(`/channels/${c.id}/stage`)), 'Stage ended') }, 'End stage'),
        h('button.btn', { onclick: async () => { const n = await prompt('Clone channel', 'Name of the copy', c.name); if (n) { const x = await act(api('POST', G(`/channels/${c.id}/clone`), { name: n }), 'Cloned'); if (x) location.hash = `#/channels?${x.id}`; } } }, '📄 Clone'),
        inviteOut,
        h('span.grow'),
        h('button.btn.danger', { onclick: async () => {
          if (await confirmDanger(`Delete ${c.type} "${c.name}"?${c.type === 'category' ? ' (channels inside are kept)' : ' All messages are lost.'}`)) if (await act(api('DELETE', G(`/channels/${c.id}`)), 'Deleted')) location.hash = '#/channels';
        } }, 'Delete'),
        h('button.btn.primary', { onclick: save }, '💾 Save'),
      ),
    ),
    h('div.card', h('h3', '🔐 Permissions'), c.synced && h('p.small.muted', 'Currently synced with its category — changing these un-syncs it.'), ow),
  );
}

