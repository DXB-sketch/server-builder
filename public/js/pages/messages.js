// Messages & embeds: composer with live preview, role/link buttons, message list, purge.
import { state, api, G, h, act, toast, confirmDanger, prompt, field, input, area, check, select, channelSelect, loadGuildData, needGuild, fmtDate, fileToDataURL } from '../core.js';

const TEXTISH = ['text', 'announcement', 'voice', 'stage', 'forum', 'media'];
const hexOf = (n) => (n == null ? '#8b5cf6' : '#' + Number(n).toString(16).padStart(6, '0'));

function emptyEmbed() {
  return { title: '', url: '', description: '', color: '#8b5cf6', author: '', thumbnail: '', image: '', footer: '', timestamp: false, fields: [] };
}
function embedToModel(e) {
  return {
    title: e.title || '', url: e.url || '', description: e.description || '', color: hexOf(e.color),
    author: e.author?.name || '', thumbnail: e.thumbnail?.url || '', image: e.image?.url || '', footer: e.footer?.text || '',
    timestamp: !!e.timestamp, fields: (e.fields || []).map((f) => ({ ...f })),
  };
}
function modelToEmbed(m) {
  const e = {};
  if (m.title) e.title = m.title;
  if (m.url) e.url = m.url;
  if (m.description) e.description = m.description;
  if (m.color) e.color = m.color;
  if (m.author) e.author = { name: m.author };
  if (m.thumbnail) e.thumbnail = { url: m.thumbnail };
  if (m.image) e.image = { url: m.image };
  if (m.footer) e.footer = { text: m.footer };
  if (m.timestamp) e.timestamp = true;
  const fields = m.fields.filter((f) => f.name && f.value);
  if (fields.length) e.fields = fields;
  return e;
}
function buttonsFromComponents(rows) {
  const out = [];
  for (const row of rows || [])
    for (const c of row.components || []) {
      if (c.type !== 2) continue;
      const b = { label: c.label || '', emoji: c.emoji?.name || '' };
      if (c.url) Object.assign(b, { kind: 'link', url: c.url });
      else if (c.custom_id?.startsWith('mc:role:')) {
        const [, , mode, role] = c.custom_id.split(':');
        Object.assign(b, { kind: 'role', role, mode, style: ['', 'Primary', 'Secondary', 'Success', 'Danger'][c.style] || 'Secondary' });
      } else continue;
      out.push(b);
    }
  return out;
}

const md = (s) => s; // preview shows raw markdown

export function composer({ onSend, sendLabel = 'Send', initial = {}, forum = false, extra = null }) {
  const model = {
    content: initial.content || '',
    embeds: (initial.embeds || []).map(embedToModel),
    buttons: buttonsFromComponents(initial.components),
  };
  const box = h('div');
  const preview = h('div');
  const opts = {
    pin: check('Pin after sending', false),
    publish: check('Publish (announcement channels)', false),
    silent: check('Silent (no push notification)', false),
    allow: check('Allow @everyone / role pings', false),
  };
  const threadName = input('', { placeholder: 'Post title (forum channels)' });
  let files = [];
  const fileEl = h('input', { type: 'file', multiple: true, onchange: async (e) => { files = await Promise.all([...e.target.files].map(async (f) => ({ name: f.name, data: await fileToDataURL(f) }))); } });

  const renderPreview = () => {
    const me = state.status?.user;
    preview.replaceChildren(
      h('div.dmsg',
        h('img.avatar', { src: me?.avatar || '', style: { width: '40px', height: '40px' } }),
        h('div.body',
          h('div', h('b', me?.tag?.split('#')[0] || 'Bot'), ' ', h('span.tag.acc', 'APP')),
          model.content && h('div.content', md(model.content)),
          model.embeds.map((e) =>
            h('div.dembed', { style: { borderLeftColor: e.color } },
              e.author && h('div.small', h('b', e.author)),
              e.title && h('div.t', e.title),
              e.description && h('div.d', e.description),
              e.fields.length > 0 && h('div.fields', e.fields.filter((f) => f.name || f.value).map((f) => h('div.fld' + (f.inline ? '.inline' : ''), h('b', f.name), h('span', { style: { whiteSpace: 'pre-wrap' } }, f.value)))),
              e.image && h('img.im', { src: e.image }),
              (e.footer || e.timestamp) && h('div.ft', [e.footer, e.timestamp ? 'Today' : ''].filter(Boolean).join(' • ')),
            )),
          model.buttons.length > 0 && h('div.dbtns', model.buttons.map((b) => h('span.dbtn.' + (b.kind === 'link' ? 'Secondary' : b.style || 'Secondary'), b.emoji ? b.emoji + ' ' : '', b.label, b.kind === 'link' ? ' ↗' : ''))),
        ),
      ),
    );
  };

  const bind = (obj, key, el, ev = 'input') => {
    el.addEventListener(ev, () => {
      obj[key] = el.type === 'checkbox' ? el.checked : el.value;
      renderPreview();
    });
    return el;
  };

  const render = () => {
    box.replaceChildren();
    if (forum) box.append(field('Post title', threadName));
    box.append(field('Message text', bind(model, 'content', area(model.content, { rows: 4, placeholder: 'Plain text, **markdown**, <@&roleId> pings, :emoji:…' }))));

    model.embeds.forEach((e, i) => {
      const fieldsBox = h('div');
      const renderFields = () => {
        fieldsBox.replaceChildren(...e.fields.map((f, j) =>
          h('div.row', { style: { marginBottom: '4px', alignItems: 'flex-start' } },
            h('div.grow', bind(f, 'name', input(f.name, { placeholder: 'Field name' }))),
            h('div.grow', bind(f, 'value', area(f.value, { rows: 1, placeholder: 'Field value', style: { minHeight: '36px' } }))),
            check('inline', f.inline, { onchange: (ev) => { f.inline = ev.target.checked; renderPreview(); } }),
            h('button.btn.sm.danger', { onclick: () => { e.fields.splice(j, 1); renderFields(); renderPreview(); } }, '✕'))),
        h('button.btn.sm', { onclick: () => { if (e.fields.length >= 25) return; e.fields.push({ name: '', value: '', inline: false }); renderFields(); } }, '+ field'));
      };
      renderFields();
      const ts = check('Timestamp', e.timestamp);
      bind(e, 'timestamp', ts.input, 'change');
      box.append(h('div.card', { style: { background: 'var(--bg2)', borderLeft: `4px solid ${e.color}` } },
        h('h3', h('span.grow', `Embed ${i + 1}`), h('button.btn.sm.danger', { onclick: () => { model.embeds.splice(i, 1); render(); } }, 'Remove embed')),
        h('div.row', h('div.grow', field('Title', bind(e, 'title', input(e.title)))), field('Colour', bind(e, 'color', h('input', { type: 'color', value: e.color })))),
        field('Description', bind(e, 'description', area(e.description, { rows: 5 }))),
        h('div.grid.g2',
          field('Title link URL', bind(e, 'url', input(e.url))), field('Author name', bind(e, 'author', input(e.author))),
          field('Thumbnail URL', bind(e, 'thumbnail', input(e.thumbnail))), field('Image URL', bind(e, 'image', input(e.image))),
          field('Footer', bind(e, 'footer', input(e.footer))), h('div', { style: { paddingTop: '22px' } }, ts)),
        field('Fields', fieldsBox),
      ));
    });

    const btnBox = h('div');
    model.buttons.forEach((b, i) => {
      const kind = select([['role', 'Role button'], ['link', 'Link button']], b.kind || 'role', { style: { width: '130px' } });
      kind.addEventListener('change', () => { b.kind = kind.value; render(); });
      const row = h('div.row', { style: { marginBottom: '6px' } }, kind,
        bind(b, 'emoji', input(b.emoji, { placeholder: '😀', style: { width: '60px' } })),
        h('div.grow', bind(b, 'label', input(b.label, { placeholder: 'Label' }))));
      if (b.kind === 'link') row.append(h('div.grow', bind(b, 'url', input(b.url || '', { placeholder: 'https://…' }))));
      else {
        const rs = select([['', '— role —'], ...state.roles.filter((r) => !r.everyone && !r.managed).map((r) => [r.id, r.name])], b.role, { style: { width: '170px' } });
        row.append(bind(b, 'role', rs, 'change'),
          bind(b, 'mode', select([['toggle', 'toggle'], ['add', 'add only'], ['remove', 'remove only']], b.mode || 'toggle', { style: { width: '120px' } }), 'change'),
          bind(b, 'style', select(['Secondary', 'Primary', 'Success', 'Danger'], b.style || 'Secondary', { style: { width: '120px' } }), 'change'));
      }
      row.append(h('button.btn.sm.danger', { onclick: () => { model.buttons.splice(i, 1); render(); } }, '✕'));
      btnBox.append(row);
    });

    box.append(
      h('div.row', { style: { margin: '8px 0 12px' } },
        h('button.btn.sm', { onclick: () => { if (model.embeds.length >= 10) return toast('Max 10 embeds', true); model.embeds.push(emptyEmbed()); render(); } }, '+ Embed'),
        h('button.btn.sm', { onclick: () => { if (model.buttons.length >= 25) return toast('Max 25 buttons', true); model.buttons.push({ kind: 'role', label: '', emoji: '', mode: 'toggle', style: 'Secondary' }); render(); } }, '+ Button'),
        h('button.btn.sm', { onclick: async () => {
          const json = await prompt('Import message JSON', 'Paste { content, embeds, components } (e.g. from discohook)', '');
          if (!json) return;
          try {
            const j = JSON.parse(json);
            model.content = j.content || '';
            model.embeds = (j.embeds || []).map(embedToModel);
            model.buttons = buttonsFromComponents(j.components);
            render();
          } catch (e) { toast('Invalid JSON: ' + e.message, true); }
        } }, 'Import JSON'),
        h('button.btn.sm', { onclick: () => navigator.clipboard.writeText(JSON.stringify(payload(), null, 2)).then(() => toast('Copied message JSON')) }, 'Copy JSON'),
      ),
      model.buttons.length > 0 && field('Buttons (role buttons give/take roles when clicked — the bot must stay online)', btnBox),
      field('Attachments', fileEl),
      h('div', Object.values(opts)),
      extra,
      h('div.row.end', { style: { marginTop: '10px' } },
        h('button.btn', { onclick: () => { model.content = ''; model.embeds = []; model.buttons = []; render(); } }, 'Clear'),
        h('button.btn.primary', { onclick: () => onSend(payload(), threadName.value) }, sendLabel)),
    );
    renderPreview();
  };
  const payload = () => ({
    content: model.content,
    embeds: model.embeds.map(modelToEmbed),
    buttons: model.buttons.map((b) => (b.kind === 'link' ? { label: b.label, emoji: b.emoji || undefined, url: b.url } : { label: b.label, emoji: b.emoji || undefined, role: b.role, mode: b.mode, style: b.style })),
    files,
    pin: opts.pin.input.checked,
    publish: opts.publish.input.checked,
    silent: opts.silent.input.checked,
    allowMentions: opts.allow.input.checked,
  });
  render();
  box.preview = preview;
  return box;
}

export async function messages(root) {
  if (needGuild(root)) return;
  await loadGuildData();
  const [cid, editId] = (location.hash.split('?')[1] || '').split('/');
  const ch = state.channels.find((c) => c.id === cid) || (cid ? { id: cid, name: 'thread', type: 'thread' } : null);
  const pick = channelSelect(cid, { types: TEXTISH, none: '— choose channel —', attrs: { onchange: () => (location.hash = `#/messages?${pick.value}`) } });
  root.append(h('div.card', h('div.row', h('b', 'Channel'), h('div.grow', pick))));
  if (!ch) return root.append(h('div.card.empty', 'Pick a channel to send, edit or manage messages.'));

  const forum = ['forum', 'media'].includes(ch.type);
  let editing = null;
  if (editId) editing = await api('GET', G(`/channels/${cid}/messages?limit=100`)).then((l) => l.find((m) => m.id === editId)).catch(() => null);

  const comp = composer({
    forum,
    initial: editing || {},
    sendLabel: editing ? '💾 Save edit' : forum ? '📮 Create post' : '📨 Send',
    onSend: async (p, threadName) => {
      if (!p.content && !p.embeds.length && !p.files.length) return toast('Message is empty', true);
      if (editing) {
        if (await act(api('PATCH', G(`/channels/${cid}/messages/${editing.id}`), p), 'Message edited')) location.hash = `#/messages?${cid}`;
      } else if (await act(api('POST', G(`/channels/${cid}/messages`), { ...p, threadName }), forum ? 'Post created' : 'Message sent')) window.rerender();
    },
  });
  root.append(h('div.grid.g2',
    h('div.card', h('h3', h('span.grow', editing ? '✏️ Editing message' : forum ? '📮 New forum post' : '✍️ Compose'), editing && h('a.btn.sm', { href: `#/messages?${cid}` }, 'Cancel edit')), comp),
    h('div', h('div.card', { style: { position: 'sticky', top: '0' } }, h('h3', '👀 Preview'), comp.preview)),
  ));

  if (forum) return;
  const list = h('div');
  const load = async () => {
    const msgs = await api('GET', G(`/channels/${cid}/messages?limit=50`)).catch((e) => (toast(e.message, true), []));
    list.replaceChildren(...(msgs.length ? msgs : []).map((m) =>
      h('div.msgline',
        h('img.avatar', { src: m.author?.avatar || '' }),
        h('div.grow',
          h('div.meta', h('b', m.author?.tag || 'unknown'), ' · ', fmtDate(m.createdAt), m.pinned ? ' · 📌' : '', m.editedAt ? ' · (edited)' : ''),
          m.content && h('div', { style: { whiteSpace: 'pre-wrap' } }, m.content),
          m.embeds.map((e) => h('div.dembed', { style: { borderLeftColor: hexOf(e.color) } }, e.title && h('div.t', e.title), e.description && h('div.d', e.description.slice(0, 400)))),
          m.attachments.map((a) => h('div', h('a', { href: a.url, target: '_blank' }, '📎 ' + a.name))),
          m.reactions.length > 0 && h('div.row', m.reactions.map((r) => h('span.tag', `${r.emoji} ${r.count}`))),
          h('div.acts',
            m.mine && h('a.btn.sm', { href: `#/messages?${cid}/${m.id}` }, '✏️ Edit'),
            h('button.btn.sm', { onclick: () => act(api('POST', G(`/channels/${cid}/messages/${m.id}/pin`), { pinned: !m.pinned }), m.pinned ? 'Unpinned' : 'Pinned').then(load) }, m.pinned ? 'Unpin' : '📌 Pin'),
            h('button.btn.sm', { onclick: async () => { const e = await prompt('React', 'Emoji (unicode or name:id)', '👍'); if (e) act(api('POST', G(`/channels/${cid}/messages/${m.id}/react`), { emoji: e }), 'Reacted').then(load); } }, '😀 React'),
            m.reactions.length > 0 && h('button.btn.sm', { onclick: () => act(api('DELETE', G(`/channels/${cid}/messages/${m.id}/reactions`)), 'Reactions cleared').then(load) }, 'Clear reactions'),
            ch.type === 'announcement' && h('button.btn.sm', { onclick: () => act(api('POST', G(`/channels/${cid}/messages/${m.id}/crosspost`)), 'Published') }, '📢 Publish'),
            h('button.btn.sm', { onclick: async () => { const n = await prompt('Start thread', 'Thread name', 'Discussion'); if (n) act(api('POST', G(`/channels/${cid}/messages/${m.id}/thread`), { name: n }), 'Thread created'); } }, '🧵 Thread'),
            h('a.btn.sm', { href: m.url, target: '_blank' }, 'Open'),
            h('button.btn.sm', { onclick: () => navigator.clipboard.writeText(m.id).then(() => toast('ID copied')) }, 'Copy ID'),
            h('button.btn.sm.danger', { onclick: () => act(api('DELETE', G(`/channels/${cid}/messages/${m.id}`)), 'Deleted').then(load) }, 'Delete'),
          ),
        ),
      )));
    if (!msgs.length) list.append(h('div.empty', 'No messages.'));
  };
  const count = input('20', { type: 'number', style: { width: '90px' } });
  const user = input('', { placeholder: 'only from user ID (optional)', style: { width: '220px' } });
  const bots = check('only bots', false);
  root.append(
    h('div.card', h('h3', '🧹 Purge'), h('div.row', 'Delete the last', count, 'messages', user, bots,
      h('button.btn.danger', { onclick: async () => {
        if (await confirmDanger(`Delete up to ${count.value} messages in #${ch.name}?`)) act(api('POST', G(`/channels/${cid}/purge`), { count: Number(count.value), userId: user.value || undefined, bots: bots.input.checked }), (r) => `Deleted ${r.count} message(s)`).then(load);
      } }, 'Purge')), h('p.small.muted', 'Discord only allows bulk-deleting messages newer than 14 days.')),
    h('div.card', h('h3', h('span.grow', '🗨️ Recent messages'), h('button.btn.sm', { onclick: load }, 'Refresh')), list),
  );
  load();
}
