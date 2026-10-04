// Events, emojis & stickers, invites, webhooks, threads.
import { state, api, G, h, act, toast, confirmDanger, prompt, field, input, area, check, select, fileInput, channelSelect, loadGuildData, needGuild, fmtDate, roleChecklist, typeIcon } from '../core.js';

const copyBtn = (text, label = 'Copy') => h('button.btn.sm', { onclick: () => navigator.clipboard.writeText(text).then(() => toast('Copied')) }, label);
const local = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

// ───────────────────────────── events ─────────────────────────────
function eventForm(e = {}, onSave) {
  const name = input(e.name || '');
  const desc = area(e.description || '', { rows: 3 });
  const kind = select(state.meta.eventEntityTypes, e.entityType || 'External');
  const ch = channelSelect(e.channelId, { types: ['voice', 'stage'] });
  const loc = input(e.location || 'Balloon Pump on Roblox');
  const start = h('input', { type: 'datetime-local', value: local(e.start || Date.now() + 3600000) });
  const end = h('input', { type: 'datetime-local', value: local(e.end || Date.now() + 7200000) });
  let image;
  const where = h('div');
  const upd = () => where.replaceChildren(kind.value === 'External' ? field('Location', loc) : field('Channel', ch));
  kind.addEventListener('change', upd);
  upd();
  return h('div', field('Name', name), field('Description', desc), h('div.grid.g2', field('Type', kind), where, field('Starts', start), field('Ends', end)),
    field('Cover image', fileInput((d) => (image = d))),
    h('div.row.end', h('button.btn.primary', { onclick: () => onSave({
      name: name.value, description: desc.value, entityType: kind.value, channelId: ch.value || undefined, location: loc.value,
      start: start.value ? new Date(start.value).toISOString() : undefined, end: end.value ? new Date(end.value).toISOString() : undefined, image,
    }) }, '💾 Save event')));
}

export async function events(root) {
  if (needGuild(root)) return;
  await loadGuildData();
  const list = await api('GET', G('/events'));
  root.append(h('div.grid.g2',
    h('div.card', h('h3', '📅 Scheduled events'),
      list.length ? list.map((e) => h('div.card', { style: { background: 'var(--bg2)' } },
        h('h3', h('span.grow', e.name), h('span.tag', e.status), h('span.tag', `${e.userCount ?? 0} interested`)),
        h('div.small.muted', `${fmtDate(e.start)} → ${fmtDate(e.end)} · ${e.entityType}${e.location ? ' · ' + e.location : ''}`),
        e.description && h('p', e.description),
        h('div.row',
          e.status === 'Scheduled' && h('button.btn.sm.ok', { onclick: () => act(api('PATCH', G(`/events/${e.id}`), { status: 'Active' }), 'Event started').then(window.rerender) }, '▶ Start'),
          e.status === 'Active' && h('button.btn.sm', { onclick: () => act(api('PATCH', G(`/events/${e.id}`), { status: 'Completed' }), 'Event ended').then(window.rerender) }, '⏹ End'),
          e.status === 'Scheduled' && h('button.btn.sm', { onclick: () => act(api('PATCH', G(`/events/${e.id}`), { status: 'Canceled' }), 'Cancelled').then(window.rerender) }, 'Cancel'),
          copyBtn(e.url, 'Copy link'),
          h('button.btn.sm.danger', { onclick: async () => (await confirmDanger(`Delete "${e.name}"?`)) && act(api('DELETE', G(`/events/${e.id}`)), 'Deleted').then(window.rerender) }, 'Delete'))))
        : h('div.empty', 'No upcoming events.')),
    h('div.card', h('h3', '➕ New event'), eventForm({}, (b) => act(api('POST', G('/events'), b), 'Event created').then((r) => r && window.rerender()))),
  ));
}

// ───────────────────────────── emojis & stickers ─────────────────────────────
export async function emojis(root) {
  if (needGuild(root)) return;
  await loadGuildData();
  const [em, st] = await Promise.all([api('GET', G('/emojis')), api('GET', G('/stickers'))]);
  let img;
  const name = input('', { placeholder: 'emoji_name' });
  const roles = roleChecklist([]);
  let sfile;
  let sname = '';
  const stName = input('', { placeholder: 'Sticker name' });
  const stTag = input('🎈', { placeholder: 'Related emoji', style: { width: '90px' } });
  const stDesc = input('', { placeholder: 'Description' });
  root.append(
    h('div.grid.g2',
      h('div.card', h('h3', '➕ Upload emoji'), h('p.small.muted', 'PNG / GIF / JPG under 256 KB. Names: letters, numbers, underscores.'),
        field('Image', fileInput((d, f) => { img = d; if (!name.value) name.value = f.name.replace(/\.\w+$/, '').replace(/\W/g, '_'); })), field('Name', name),
        field('Restrict to roles (optional)', roles),
        h('div.row.end', h('button.btn.primary', { onclick: () => img && act(api('POST', G('/emojis'), { image: img, name: name.value, roles: roles.value() }), 'Emoji uploaded').then((r) => r && window.rerender()) }, 'Upload'))),
      h('div.card', h('h3', '➕ Upload sticker'), h('p.small.muted', 'PNG / APNG / GIF / Lottie JSON, 320×320, under 512 KB.'),
        field('File', fileInput((d, f) => { sfile = d; sname = f.name; }, 'image/png,image/apng,image/gif,application/json')),
        field('Name', stName), h('div.row', stTag, h('div.grow', stDesc)),
        h('div.row.end', { style: { marginTop: '8px' } }, h('button.btn.primary', { onclick: () => sfile && act(api('POST', G('/stickers'), { file: sfile, fileName: sname, name: stName.value, tags: stTag.value, description: stDesc.value }), 'Sticker uploaded').then((r) => r && window.rerender()) }, 'Upload'))),
    ),
    h('div.card', h('h3', `😀 Emojis (${em.length})`),
      h('div.grid.g3', em.map((e) => h('div.row', { style: { background: 'var(--bg2)', padding: '8px', borderRadius: '8px' } },
        h('img', { src: e.url, style: { width: '32px', height: '32px', objectFit: 'contain' } }), h('code.grow', `:${e.name}:`),
        copyBtn(`<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`, 'Copy code'),
        h('button.btn.sm', { onclick: async () => { const n = await prompt('Rename emoji', 'New name', e.name); if (n) act(api('PATCH', G(`/emojis/${e.id}`), { name: n }), 'Renamed').then(window.rerender); } }, '✏️'),
        h('button.btn.sm.danger', { onclick: async () => (await confirmDanger(`Delete :${e.name}:?`)) && act(api('DELETE', G(`/emojis/${e.id}`)), 'Deleted').then(window.rerender) }, '✕')))),
      !em.length && h('div.empty', 'No custom emojis.')),
    h('div.card', h('h3', `🏷️ Stickers (${st.length})`),
      h('div.grid.g3', st.map((s) => h('div.row', { style: { background: 'var(--bg2)', padding: '8px', borderRadius: '8px' } },
        h('img', { src: s.url, style: { width: '48px', height: '48px', objectFit: 'contain' } }), h('span.grow', s.name, h('div.small.muted', s.description || '')),
        h('button.btn.sm', { onclick: async () => { const n = await prompt('Rename sticker', 'New name', s.name); if (n) act(api('PATCH', G(`/stickers/${s.id}`), { name: n }), 'Renamed').then(window.rerender); } }, '✏️'),
        h('button.btn.sm.danger', { onclick: async () => (await confirmDanger(`Delete sticker ${s.name}?`)) && act(api('DELETE', G(`/stickers/${s.id}`)), 'Deleted').then(window.rerender) }, '✕')))),
      !st.length && h('div.empty', 'No stickers.')),
  );
}

// ───────────────────────────── invites ─────────────────────────────
export async function invites(root) {
  if (needGuild(root)) return;
  await loadGuildData();
  const list = await api('GET', G('/invites'));
  const ch = channelSelect('', { types: ['text', 'announcement', 'voice', 'stage', 'forum'], none: '— channel —' });
  const age = select([[0, 'Never expires'], [1800, '30 minutes'], [3600, '1 hour'], [21600, '6 hours'], [43200, '12 hours'], [86400, '1 day'], [604800, '7 days']], 0);
  const uses = select([[0, 'No limit'], [1, '1 use'], [5, '5 uses'], [10, '10 uses'], [25, '25 uses'], [50, '50 uses'], [100, '100 uses']], 0);
  const temp = check('Temporary membership', false);
  const out = h('div');
  root.append(
    h('div.card', h('h3', '🔗 Create invite'),
      h('div.row', h('div.grow', ch), age, uses, temp, h('button.btn.primary', { onclick: async () => {
        if (!ch.value) return toast('Choose a channel', true);
        const r = await act(api('POST', G(`/channels/${ch.value}/invites`), { maxAge: Number(age.value), maxUses: Number(uses.value), temporary: temp.input.checked }), 'Invite created');
        if (r) out.replaceChildren(h('div.row', { style: { marginTop: '10px' } }, h('a', { href: r.url, target: '_blank' }, r.url), copyBtn(r.url)));
      } }, 'Create')), out),
    h('div.card', h('h3', `Active invites (${list.length})`),
      list.length
        ? h('table.t', h('tr', h('th', 'Code'), h('th', 'Channel'), h('th', 'Creator'), h('th', 'Uses'), h('th', 'Expires'), h('th', '')),
            list.map((i) => h('tr', h('td', h('code', i.code)), h('td', '#' + i.channel), h('td', i.inviter || '—'), h('td', `${i.uses}${i.maxUses ? '/' + i.maxUses : ''}`),
              h('td.small', i.expiresAt ? fmtDate(i.expiresAt) : 'never'),
              h('td', h('div.row', copyBtn(i.url), h('button.btn.sm.danger', { onclick: () => act(api('DELETE', G(`/invites/${i.code}`)), 'Invite revoked').then(window.rerender) }, 'Revoke'))))))
        : h('div.empty', 'No invites.')),
  );
}

// ───────────────────────────── webhooks ─────────────────────────────
export async function webhooks(root) {
  if (needGuild(root)) return;
  await loadGuildData();
  const list = await api('GET', G('/webhooks'));
  const ch = channelSelect('', { types: ['text', 'announcement', 'forum'], none: '— channel —' });
  const name = input('', { placeholder: 'Webhook name (e.g. Roblox Game Logs)' });
  let avatar;
  root.append(
    h('div.card', h('h3', '🪝 Create webhook'), h('p.small.muted', 'Webhooks let other apps (like your Roblox game via HttpService proxy, GitHub, etc.) post into a channel.'),
      h('div.row', h('div.grow', ch), h('div.grow', name), fileInput((d) => (avatar = d)),
        h('button.btn.primary', { onclick: async () => {
          if (!ch.value) return toast('Choose a channel', true);
          const r = await act(api('POST', G(`/channels/${ch.value}/webhooks`), { name: name.value || 'Webhook', avatar }), 'Webhook created');
          if (r) window.rerender();
        } }, 'Create'))),
    h('div.card', h('h3', `Webhooks (${list.length})`),
      list.length ? list.map((w) => {
        const content = area('', { rows: 2, placeholder: 'Send a message through this webhook…' });
        const uname = input('', { placeholder: 'Override name (optional)' });
        return h('div.card', { style: { background: 'var(--bg2)' } },
          h('h3', w.avatar && h('img.avatar', { src: w.avatar }), h('span.grow', w.name, h('div.small.muted', `#${state.channels.find((c) => c.id === w.channelId)?.name || w.channelId} · created by ${w.owner || 'unknown'}`)),
            w.url && copyBtn(w.url, 'Copy URL'),
            h('button.btn.sm', { onclick: async () => { const n = await prompt('Rename webhook', 'Name', w.name); if (n) act(api('PATCH', G(`/webhooks/${w.id}`), { name: n }), 'Renamed').then(window.rerender); } }, '✏️ Rename'),
            h('button.btn.sm.danger', { onclick: async () => (await confirmDanger(`Delete webhook ${w.name}?`)) && act(api('DELETE', G(`/webhooks/${w.id}`)), 'Deleted').then(window.rerender) }, 'Delete')),
          w.url && h('div', content, h('div.row', { style: { marginTop: '6px' } }, h('div.grow', uname),
            h('button.btn', { onclick: () => content.value && act(api('POST', G(`/webhooks/${w.id}/send`), { content: content.value, username: uname.value }), 'Sent') }, 'Send'))));
      }) : h('div.empty', 'No webhooks.')),
  );
}

// ───────────────────────────── threads ─────────────────────────────
export async function threads(root) {
  if (needGuild(root)) return;
  await loadGuildData();
  const list = await api('GET', G('/threads'));
  const ch = channelSelect('', { types: ['text', 'announcement'], none: '— channel —' });
  const name = input('', { placeholder: 'Thread name' });
  const priv = check('Private thread', false);
  root.append(
    h('div.card', h('h3', '🧵 Start a thread'), h('p.small.muted', 'To create a forum post, open the forum channel in Messages & Embeds.'),
      h('div.row', h('div.grow', ch), h('div.grow', name), priv,
        h('button.btn.primary', { onclick: () => ch.value && name.value && act(api('POST', G(`/channels/${ch.value}/threads`), { name: name.value, private: priv.input.checked }), 'Thread created').then(window.rerender) }, 'Create'))),
    h('div.card', h('h3', `Active threads & forum posts (${list.length})`),
      list.length
        ? h('table.t', h('tr', h('th', 'Thread'), h('th', 'In'), h('th', 'Messages'), h('th', '')),
            list.map((t) => h('tr', h('td', typeIcon('thread'), ' ', t.name, t.locked ? ' 🔒' : ''), h('td', '#' + (t.parentName || '?')), h('td', t.messageCount ?? '—'),
              h('td', h('div.row',
                h('a.btn.sm', { href: `#/messages?${t.id}` }, 'Messages'),
                h('button.btn.sm', { onclick: async () => { const n = await prompt('Rename thread', 'Name', t.name); if (n) act(api('PATCH', G(`/channels/${t.id}`), { name: n }), 'Renamed').then(window.rerender); } }, 'Rename'),
                h('button.btn.sm', { onclick: () => act(api('PATCH', G(`/channels/${t.id}`), { locked: !t.locked }), t.locked ? 'Unlocked' : 'Locked').then(window.rerender) }, t.locked ? 'Unlock' : 'Lock'),
                h('button.btn.sm', { onclick: () => act(api('PATCH', G(`/channels/${t.id}`), { archived: true }), 'Archived').then(window.rerender) }, 'Archive'),
                h('button.btn.sm.danger', { onclick: async () => (await confirmDanger(`Delete thread ${t.name}?`)) && act(api('DELETE', G(`/channels/${t.id}`)), 'Deleted').then(window.rerender) }, 'Delete'))))))
        : h('div.empty', 'No active threads.')),
  );
}
