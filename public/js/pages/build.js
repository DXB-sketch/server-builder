// Dashboard (one-click builds) and the template manager.
import { state, api, h, act, toast, modal, confirmDanger, prompt, check, select, typeIcon } from '../core.js';

function targetSelect(t) {
  const guilds = state.status?.guilds || [];
  const def = t.guildId && guilds.some((g) => g.id === t.guildId) ? t.guildId : '';
  return select([['', guilds.length ? '— choose server —' : '— invite the bot first —'], ...guilds.map((g) => [g.id, g.name])], def);
}

async function runBuild(t, guildId, wipe, messages, out) {
  if (!guildId) return toast('Choose which server to build into', true);
  const g = state.status.guilds.find((x) => x.id === guildId);
  if (wipe && !(await confirmDanger(`This DELETES every channel and role in "${g?.name}" before building. Messages in those channels are lost forever.`, 'WIPE'))) return;
  if (!wipe && !(await confirmDanger(`Build "${t.name}" into "${g?.name}"? Existing channels/roles with the same names are updated, everything else is left alone.`))) return;
  out.replaceChildren();
  const listen = (e) => {
    out.append(h('div.log.' + e.level, e.msg));
    out.scrollTop = out.scrollHeight;
    if (/━━ Done|Build crashed/.test(e.msg)) window.logListeners.delete(listen);
  };
  window.logListeners.add(listen);
  const r = await act(api('POST', `/templates/${t.id}/apply`, { guildId, wipe, messages }), `Building into ${g?.name}… watch the log`);
  if (!r) window.logListeners.delete(listen);
}

export async function dashboard(root) {
  const s = state.status || (await api('GET', '/status'));
  const templates = await api('GET', '/templates');
  if (!s.ready) {
    root.append(h('div.banner.err', h('b', 'Bot is offline. '), s.error || 'Still connecting…', h('div.small', 'Put your bot token in .env as DISCORD_TOKEN and restart (npm start).')));
  } else if (!s.privilegedIntents) {
    root.append(h('div.banner', h('b', 'Limited mode: '), 'privileged intents are off, so member lists, welcome messages and auto-roles won\'t work. Enable SERVER MEMBERS, PRESENCE and MESSAGE CONTENT intents in the Developer Portal (Bot page), then click Reconnect in Bot Settings.'));
  }

  const inGuild = (id) => id && s.guilds.some((g) => g.id === id);
  const steps = [
    [s.ready, h('span', 'Put your bot token in ', h('code', '.env'), ' (', h('code', 'DISCORD_TOKEN'), ') and start the bot')],
    [s.ready && s.privilegedIntents, 'Enable the 3 privileged intents in the Developer Portal → Bot'],
    [s.env.COMMUNITY_GUILD_ID && s.env.GAME_GUILD_ID, h('span', 'Put both server IDs in ', h('code', '.env'), ' (', h('code', 'COMMUNITY_GUILD_ID'), ', ', h('code', 'GAME_GUILD_ID'), ')')],
    [inGuild(s.env.COMMUNITY_GUILD_ID) && inGuild(s.env.GAME_GUILD_ID), h('span', 'Invite the bot to both servers with Administrator ', s.invite ? h('a', { href: s.invite, target: '_blank' }, '→ invite link') : '')],
    [false, 'In each server: Server Settings → Roles → drag the bot\'s role to the very top'],
    [false, 'Click Build below 🎉'],
  ];

  root.append(
    h('div.grid.g2',
      h('div.card',
        h('h3', '✅ Setup checklist'),
        h('ol.steps', steps.map(([done, text]) => h('li', { class: done ? 'done' : '' }, text))),
        s.invite && h('div.row', { style: { marginTop: '10px' } },
          h('a.btn.primary', { href: s.invite, target: '_blank' }, '➕ Invite bot to a server'),
          h('button.btn', { onclick: () => navigator.clipboard.writeText(s.invite).then(() => toast('Invite link copied')) }, 'Copy invite link'),
        ),
      ),
      h('div.card',
        h('h3', '🗂️ Servers the bot is in'),
        s.guilds.length
          ? h('div.list', s.guilds.map((g) =>
              h('div.item', { onclick: () => { document.getElementById('guildPick').value = g.id; document.getElementById('guildPick').dispatchEvent(new Event('change')); location.hash = '#/server'; } },
                g.icon ? h('img.avatar', { src: g.icon }) : h('span.avatar'),
                h('span.name', g.name),
                g.id === s.env.COMMUNITY_GUILD_ID && h('span.tag.acc', 'Community'),
                g.id === s.env.GAME_GUILD_ID && h('span.tag.acc', 'Game'),
                h('span.tag', `${g.members} members`),
                g.admin ? h('span.tag.ok', 'Admin') : h('span.tag.err', 'No admin'),
              )))
          : h('div.empty', 'Not in any servers yet — use the invite link.'),
      ),
    ),
  );

  root.append(h('div.page-title', { style: { marginTop: '22px' } }, h('h2', '🏗️ One-click server builds')));
  const grid = h('div.grid.g2');
  for (const t of templates.filter((t) => !t.error)) {
    const target = targetSelect(t);
    const wipe = check('Wipe the server first (deletes ALL channels & roles)', false);
    const msgs = check('Post the starter messages (rules, verify, roles…)', true);
    const out = h('div.mono.small', { style: { maxHeight: '220px', overflowY: 'auto', marginTop: '10px' } });
    grid.append(
      h('div.card.tpl-card', { style: { '--tpl': t.accent || 'var(--accent)' } },
        h('h3', h('span.grow', t.name)),
        h('div.muted', t.description),
        h('div.stats',
          h('span.tag', `${t.counts.roles} roles`), h('span.tag', `${t.counts.categories} categories`), h('span.tag', `${t.counts.channels} channels`),
          h('span.tag', `${t.counts.messages} messages`), h('span.tag', `${t.counts.automod} AutoMod rules`),
          t.issues?.errors ? h('a.tag.err', { href: `#/templates?${t.id}` }, `${t.issues.errors} error(s)`) : h('span.tag.ok', '✓ template valid')),
        h('label.f', h('span', `Target server ${t.guildEnv ? `(default from .env ${t.guildEnv})` : ''}`), target),
        h('div', msgs), h('div', wipe),
        h('div.row', { style: { marginTop: '12px' } },
          h('button.btn.primary.big', { onclick: () => runBuild(t, target.value, wipe.input.checked, msgs.input.checked, out) }, '🚀 Build server'),
          h('a.btn', { href: `#/templates?${t.id}` }, 'View / edit template'),
        ),
        out,
      ),
    );
  }
  root.append(grid);
}

// ───────────────────────────── templates ─────────────────────────────
function preview(t) {
  const roles = h('div', (t.roles || []).map((r) => h('div.row', { style: { gap: '6px', padding: '2px 0' } }, h('span.swatch', { style: { background: r.color || '#99aab5' } }), r.name,
    (r.permissions || []).includes('Administrator') && h('span.tag.err', 'Admin'), r.hoist && h('span.tag', 'shown separately'))));
  const tree = h('div.tree');
  for (const c of t.channels || []) tree.append(h('div.ch', typeIcon(c.type || 'text'), ' ', c.name));
  for (const cat of t.categories || []) {
    tree.append(h('div.c', cat.name, cat.permissions?.['@everyone']?.deny?.includes('ViewChannel') ? ' 🔒' : ''));
    for (const c of cat.channels || []) tree.append(h('div.ch', typeIcon(c.type || 'text'), ' ', c.name, c.permissions ? ' ⚙' : '', c.tags ? h('span.muted.small', `  (${c.tags.length} tags)`) : ''));
  }
  const s = t.settings || {};
  return h('div.grid.g2',
    h('div', h('h4', 'Channels'), tree),
    h('div',
      h('h4', 'Roles (top → bottom)'), h('div.tree', roles),
      h('h4', 'Settings'),
      h('div.small.muted', `Name: ${s.name || '—'} · Community: ${s.community ? 'yes' : 'no'} · Verification: ${s.verificationLevel || '—'}`),
      h('div.small.muted', `${t.messages?.length || 0} starter messages · ${t.automod?.length || 0} AutoMod rules · welcome screen: ${t.welcomeScreen ? 'yes' : 'no'}`),
    ),
  );
}

export async function templates(root) {
  const list = await api('GET', '/templates');
  let current = location.hash.split('?')[1] || list[0]?.id;
  const left = h('div.card', h('h3', h('span.grow', 'Templates'),
    h('button.btn.sm', { onclick: async () => {
      const id = await prompt('New template', 'File name (letters, numbers, dashes)', 'my-template');
      if (!id) return;
      if (await act(api('PUT', `/templates/${id}`, { name: id, description: '', roles: [], categories: [] }), 'Template created')) location.hash = `#/templates?${id}`;
    } }, '+ New')));
  const lst = h('div.list');
  left.append(lst);
  left.append(h('hr'), h('p.small.muted', 'Turn the selected server into a reusable template (great for backups or copying a server you already made):'),
    h('button.btn', { disabled: !state.guildId, onclick: async () => {
      const t = await act(api('GET', `/guilds/${state.guildId}/export`));
      if (!t) return;
      const id = await prompt('Save export as', 'Template file name', 'export-' + new Date().toISOString().slice(0, 10));
      if (id && (await act(api('PUT', `/templates/${id}`, t), 'Exported!'))) location.hash = `#/templates?${id}`;
    } }, '⬇️ Export selected server'));
  const right = h('div');
  root.append(h('div.split', left, right));

  for (const t of list) {
    lst.append(h('div.item', { class: t.id === current ? 'sel' : '', onclick: () => (location.hash = `#/templates?${t.id}`) },
      h('span.swatch', { style: { background: t.accent || 'var(--accent)' } }), h('span.name', t.name), t.error && h('span.tag.err', 'invalid')));
  }
  if (!current) return right.append(h('div.card.empty', 'No templates yet.'));

  let text;
  let t;
  try {
    t = await api('GET', `/templates/${current}`);
    delete t.id;
    text = JSON.stringify(t, null, 2);
  } catch (e) {
    return right.append(h('div.banner.err', e.message));
  }
  const ta = h('textarea.code', { spellcheck: false }, text);
  const status = h('span.small.muted');
  const parse = () => {
    try {
      const v = JSON.parse(ta.value);
      status.textContent = '✓ valid JSON';
      status.style.color = 'var(--ok)';
      return v;
    } catch (e) {
      status.textContent = '✕ ' + e.message;
      status.style.color = 'var(--err)';
      return null;
    }
  };
  ta.addEventListener('input', parse);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
    }
  });
  const prevBox = h('div', preview(t));
  const checkBox = h('div');
  const showCheck = (r) => checkBox.replaceChildren(
    !r.errors.length && !r.warnings.length ? h('div.small', { style: { color: 'var(--ok)' } }, '✓ No problems found') : null,
    ...r.errors.map((e) => h('div.small', { style: { color: 'var(--err)' } }, '✕ ' + e)),
    ...r.warnings.map((w) => h('div.small', { style: { color: 'var(--warn)' } }, '⚠ ' + w)),
  );
  api('GET', `/templates/${current}/validate`).then(showCheck).catch(() => {});
  const wipe = check('Wipe first', false);
  const msgs = check('Post messages', true);
  const out = h('div.mono.small', { style: { maxHeight: '220px', overflowY: 'auto', marginTop: '10px' } });

  right.append(
    h('div.card',
      h('h3', h('span.grow', t.name), h('code', `templates/${current}.json`)),
      h('p.muted', t.description || ''),
      h('div.row',
        h('span', 'Apply to the selected server:'), msgs, wipe,
        h('button.btn.primary', { onclick: () => runBuild({ id: current, name: t.name }, state.guildId, wipe.input.checked, msgs.input.checked, out) }, '🚀 Build'),
      ),
      out,
    ),
    h('div.card', h('h3', '🔎 Template check'), checkBox),
    h('div.card', h('h3', 'Preview'), prevBox),
    h('div.card',
      h('h3', h('span.grow', 'Edit JSON'), status),
      h('p.small.muted', 'Roles are listed highest first. Channel types: text, voice, announcement, stage, forum, media. Permissions use Discord names (ViewChannel, SendMessages…). Text can use {{channel:name}}, {{role:Name}}, {{server}} and {{env.VAR}} placeholders. See README for the full format.'),
      ta,
      h('div.row', { style: { marginTop: '10px' } },
        h('button.btn.primary', { onclick: async () => {
          const v = parse();
          const r = v && (await act(api('PUT', `/templates/${current}`, v), (x) => (x.errors.length ? `Saved — but ${x.errors.length} error(s) to fix` : 'Saved')));
          if (r) { prevBox.replaceChildren(preview(v)); showCheck(r); }
        } }, '💾 Save'),
        h('button.btn', { onclick: async () => {
          const v = parse();
          const id = v && (await prompt('Save as', 'New file name', current + '-copy'));
          if (id && (await act(api('PUT', `/templates/${id}`, v), 'Saved copy'))) location.hash = `#/templates?${id}`;
        } }, 'Save as copy'),
        h('button.btn', { onclick: () => {
          const v = parse();
          if (v) ta.value = JSON.stringify(v, null, 2);
        } }, 'Format'),
        h('button.btn', { onclick: () => {
          const a = h('a', { href: URL.createObjectURL(new Blob([ta.value], { type: 'application/json' })), download: current + '.json' });
          a.click();
        } }, 'Download'),
        h('span.grow'),
        h('button.btn.danger', { onclick: async () => {
          if (await confirmDanger(`Delete template ${current}.json?`)) {
            await act(api('DELETE', `/templates/${current}`), 'Deleted');
            location.hash = '#/templates';
          }
        } }, 'Delete'),
      ),
    ),
  );
  parse();
}
