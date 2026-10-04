// Shared helpers for every page: API calls, DOM building, form fields, modals,
// permission editors and cached server data.

export const state = {
  status: null,
  meta: null,
  guildId: localStorage.getItem('guildId') || '',
  token: localStorage.getItem('panelToken') || '',
  roles: [],
  channels: [],
};

// ───────────────────────────── API ─────────────────────────────
export async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-panel': '1', 'x-panel-token': state.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (res.status === 401 && path !== '/login') {
    showLogin();
  }
  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.detail = data?.detail;
    throw err;
  }
  return data;
}
export const G = (p = '') => `/guilds/${state.guildId}${p}`;

/** Run an API action with toast feedback. Returns the result or null. */
export async function act(promise, success) {
  try {
    const r = await promise;
    if (success) toast(typeof success === 'function' ? success(r) : success);
    return r ?? true;
  } catch (e) {
    toast(e.message + (e.detail ? `\n${e.detail}` : ''), true);
    return null;
  }
}

// ───────────────────────────── DOM ─────────────────────────────
// Let append()/replaceChildren() skip null/false like h() does, so conditional children are easy.
for (const fn of ['append', 'replaceChildren']) {
  const native = Element.prototype[fn];
  Element.prototype[fn] = function (...kids) {
    native.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
  };
}
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function toast(msg, err = false) {
  const t = h('div.toast' + (err ? '.err' : ''), msg);
  t.style.whiteSpace = 'pre-wrap';
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), err ? 8000 : 3500);
}

export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => {
      bg.remove();
      resolve(v);
    };
    const bg = h('div.modal-bg', { onclick: (e) => e.target === bg && close(null) },
      h('div.modal', h('h3', title), body,
        h('div.row.end', { style: { marginTop: '16px' } },
          h('button.btn', { onclick: () => close(null) }, 'Cancel'),
          actions.map((a) => h('button.btn.' + (a.kind || 'primary'), { onclick: async () => close(a.value ? await a.value() : true) }, a.label)),
        ),
      ),
    );
    document.body.append(bg);
    bg.querySelector('input,textarea,select')?.focus();
  });
}

export async function confirmDanger(text, typeToConfirm) {
  const input = typeToConfirm ? h('input', { placeholder: typeToConfirm }) : null;
  const r = await modal('Are you sure?', h('div', h('p', text), input && h('p.muted.small', `Type "${typeToConfirm}" to confirm:`), input), [
    { label: 'Yes, do it', kind: 'danger', value: () => (input ? input.value.trim() === typeToConfirm : true) },
  ]);
  if (r === false) toast('Confirmation text did not match — cancelled', true);
  return r === true;
}

export function prompt(title, label, value = '') {
  const input = h('input', { value });
  return modal(title, h('label.f', h('span', label), input), [{ label: 'OK', value: () => input.value }]);
}

// ───────────────────────────── form fields ─────────────────────────────
export const field = (label, control, hint) => h('label.f', h('span', label), control, hint && h('div.small.muted', { style: { marginTop: '3px' } }, hint));
export const input = (value = '', attrs = {}) => h('input', { type: 'text', value: value ?? '', ...attrs });
export const num = (value, attrs = {}) => h('input', { type: 'number', value: value ?? '', ...attrs });
export const area = (value = '', attrs = {}) => h('textarea', { ...attrs }, value ?? '');
export const check = (label, checked, attrs = {}) => {
  const box = h('input', { type: 'checkbox', checked: !!checked, ...attrs });
  const l = h('label.chk', box, label);
  l.input = box;
  return l;
};
export function select(options, value, attrs = {}) {
  const el = h('select', attrs);
  for (const o of options) {
    const [v, text] = Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, o];
    el.append(h('option', { value: v ?? '', selected: String(v ?? '') === String(value ?? '') }, text));
  }
  return el;
}
export function fileInput(onData, accept = 'image/*') {
  return h('input', {
    type: 'file',
    accept,
    onchange: async (e) => {
      const f = e.target.files[0];
      if (f) onData(await fileToDataURL(f), f);
    },
  });
}
export const fileToDataURL = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

export const typeIcon = (t) => ({ text: '#', voice: '🔊', category: '📁', announcement: '📢', stage: '🎤', forum: '💬', media: '🖼️', thread: '🧵' })[t] || '#';

export function channelSelect(value, { types = null, none = '— none —', attrs = {} } = {}) {
  const list = state.channels.filter((c) => !types || types.includes(c.type));
  return select([['', none], ...list.map((c) => [c.id, `${typeIcon(c.type)} ${c.name}`])], value, attrs);
}
export function roleSelect(value, { none = '— choose role —', includeEveryone = false, attrs = {} } = {}) {
  const list = state.roles.filter((r) => includeEveryone || !r.everyone);
  return select([['', none], ...list.map((r) => [r.id, r.everyone ? '@everyone' : r.name])], value, attrs);
}
export function roleChecklist(selected = []) {
  const set = new Set(selected);
  const wrap = h('div', { style: { maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '7px', padding: '6px 10px' } });
  for (const r of state.roles.filter((r) => !r.everyone && !r.managed)) {
    const c = check(h('span', h('span.swatch', { style: { background: r.color, display: 'inline-block', marginRight: '4px' } }), r.name), set.has(r.id));
    c.input.value = r.id;
    wrap.append(h('div', c));
  }
  wrap.value = () => [...wrap.querySelectorAll('input:checked')].map((i) => i.value);
  return wrap;
}

export async function loadGuildData(force = false) {
  if (!state.guildId) return;
  if (!force && state._loadedFor === state.guildId) return;
  const [roles, channels] = await Promise.all([api('GET', G('/roles')), api('GET', G('/channels'))]);
  state.roles = roles;
  state.channels = channels;
  state._loadedFor = state.guildId;
}

// ───────────────────────────── permissions ─────────────────────────────
const GROUPS = {
  'General server': ['ViewChannel', 'ManageChannels', 'ManageRoles', 'ManageGuildExpressions', 'CreateGuildExpressions', 'ViewAuditLog', 'ViewGuildInsights', 'ManageWebhooks', 'ManageGuild', 'ViewCreatorMonetizationAnalytics'],
  Membership: ['CreateInstantInvite', 'ChangeNickname', 'ManageNicknames', 'KickMembers', 'BanMembers', 'ModerateMembers'],
  'Text channels': ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads', 'EmbedLinks', 'AttachFiles', 'AddReactions', 'UseExternalEmojis', 'UseExternalStickers', 'MentionEveryone', 'ManageMessages', 'PinMessages', 'BypassSlowmode', 'ManageThreads', 'ReadMessageHistory', 'SendTTSMessages', 'SendVoiceMessages', 'SendPolls'],
  'Voice channels': ['Connect', 'Speak', 'Stream', 'UseSoundboard', 'UseExternalSounds', 'UseVAD', 'PrioritySpeaker', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'SetVoiceChannelStatus'],
  Apps: ['UseApplicationCommands', 'UseEmbeddedActivities', 'UseExternalApps'],
  'Stage & events': ['RequestToSpeak', 'CreateEvents', 'ManageEvents'],
  Advanced: ['Administrator'],
};
const HIDDEN = ['ManageEmojisAndStickers'];
export const pretty = (p) => p.replace(/([a-z])([A-Z])/g, '$1 $2').replace('VAD', 'Voice Activity').replace('TTS', 'TTS');

function grouped() {
  const all = (state.meta?.permissions || []).filter((p) => !HIDDEN.includes(p));
  const used = new Set(Object.values(GROUPS).flat());
  const groups = Object.entries(GROUPS).map(([g, list]) => [g, list.filter((p) => all.includes(p))]);
  const other = all.filter((p) => !used.has(p));
  if (other.length) groups.push(['Other', other]);
  return groups;
}

/** Checkbox editor for role permissions. el.value() -> [names] */
export function permChecklist(selected = []) {
  const set = new Set(selected);
  const wrap = h('div');
  const filter = input('', { placeholder: 'Filter permissions…', oninput: () => {
    const q = filter.value.toLowerCase();
    wrap.querySelectorAll('.chk[data-p]').forEach((l) => (l.style.display = l.dataset.p.toLowerCase().includes(q) ? '' : 'none'));
  } });
  wrap.append(h('div.row', { style: { marginBottom: '8px' } }, filter,
    h('button.btn.sm', { type: 'button', onclick: () => wrap.querySelectorAll('input[type=checkbox]').forEach((c) => (c.checked = false)) }, 'Clear all')));
  for (const [g, list] of grouped()) {
    const grid = h('div.perm-grid');
    for (const p of list) {
      const c = check(pretty(p), set.has(p));
      c.dataset.p = p + ' ' + pretty(p);
      c.input.value = p;
      grid.append(c);
    }
    wrap.append(h('div.perm-group', h('h4', g), grid));
  }
  wrap.value = () => [...wrap.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
  return wrap;
}

/** Tri-state (deny / inherit / allow) editor for one overwrite. el.value() -> {allow, deny} */
export function permTriState(allow = [], deny = []) {
  const val = {};
  for (const p of allow) val[p] = 'allow';
  for (const p of deny) val[p] = 'deny';
  const wrap = h('div');
  for (const [g, list] of grouped()) {
    const grid = h('div.perm-grid');
    for (const p of list) {
      const seg = h('span.seg');
      const mk = (k, txt) =>
        h('button', {
          type: 'button',
          class: k + ((val[p] || 'inh') === k ? ' on' : ''),
          title: k === 'inh' ? 'Inherit' : k,
          onclick: () => {
            val[p] = k === 'inh' ? undefined : k;
            seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.classList.contains(k)));
          },
        }, txt);
      seg.append(mk('deny', '✕'), mk('inh', '/'), mk('allow', '✓'));
      grid.append(h('div.tri', h('span.lbl', pretty(p)), seg));
    }
    wrap.append(h('div.perm-group', h('h4', g), grid));
  }
  wrap.value = () => ({
    allow: Object.keys(val).filter((k) => val[k] === 'allow'),
    deny: Object.keys(val).filter((k) => val[k] === 'deny'),
  });
  return wrap;
}

// ───────────────────────────── misc ─────────────────────────────
export function logLine(e, target = document.getElementById('logBox')) {
  const el = h('div.log.' + e.level, h('span.tm', e.time.slice(11, 19) + ' '), e.msg);
  const stick = target.scrollTop + target.clientHeight >= target.scrollHeight - 30;
  target.append(el);
  while (target.children.length > 1000) target.firstChild.remove();
  if (stick) target.scrollTop = target.scrollHeight;
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');
export const needGuild = (main) => {
  if (state.guildId) return false;
  main.append(h('div.card.empty', h('p', 'Pick a server in the top-right first.'), h('p.small', 'If the list is empty, invite the bot from the Dashboard.')));
  return true;
};

export function showLogin() {
  if (document.getElementById('login')) return;
  const pw = h('input', { type: 'password', placeholder: 'Panel password' });
  const go = async () => {
    try {
      const r = await api('POST', '/login', { password: pw.value });
      state.token = r.token;
      localStorage.setItem('panelToken', r.token);
      location.reload();
    } catch (e) {
      toast(e.message, true);
    }
  };
  pw.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  document.body.append(
    h('div', { id: 'login' },
      h('div.card', { style: { width: '340px' } }, h('h3', '🔒 Panel locked'), h('p.muted.small', 'Enter the PANEL_PASSWORD from your .env'), pw,
        h('div.row.end', { style: { marginTop: '12px' } }, h('button.btn.primary', { onclick: go }, 'Unlock'))),
    ),
  );
  pw.focus();
}
