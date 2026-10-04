// Members (roles, nickname, timeout, voice, kick, ban, DM), bans and prune.
import { state, api, G, h, act, toast, confirmDanger, prompt, field, input, num, area, check, select, loadGuildData, needGuild, fmtDate, roleChecklist, channelSelect } from '../core.js';

export async function members(root) {
  if (needGuild(root)) return;
  await loadGuildData();
  const [, q0 = '', sel = ''] = (location.hash.split('?')[1] || '').match(/^([^/]*)\/?(.*)$/) || [];
  const query = decodeURIComponent(q0);
  const search = input(query, { placeholder: 'Search by username or nickname…' });
  const go = () => (location.hash = `#/members?${encodeURIComponent(search.value)}`);
  search.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  const data = await api('GET', G(`/members?limit=1000${query ? `&query=${encodeURIComponent(query)}` : ''}`));
  const roleName = Object.fromEntries(state.roles.map((r) => [r.id, r]));
  const list = h('div.list', { style: { maxHeight: '72vh' } });
  for (const m of data.members) {
    list.append(h('div.item', { class: m.id === sel ? 'sel' : '', onclick: () => (location.hash = `#/members?${encodeURIComponent(query)}/${m.id}`) },
      h('img.avatar', { src: m.avatar }), h('span.name', m.displayName, h('span.muted.small', ' @' + m.username)),
      m.bot && h('span.tag', 'BOT'), m.owner && h('span.tag.acc', '👑'), m.timeoutUntil && new Date(m.timeoutUntil) > new Date() && h('span.tag.err', 'timed out')));
  }
  const left = h('div.card', h('h3', `Members (${data.members.length} shown / ${data.total})`), h('div.row', { style: { marginBottom: '8px' } }, h('div.grow', search), h('button.btn', { onclick: go }, 'Search')), list);
  const right = h('div');
  root.append(h('div.split', left, right));
  if (!sel) return right.append(h('div.card.empty', 'Select a member.'));
  const m = data.members.find((x) => x.id === sel) || (await api('GET', G(`/members/${sel}`)));

  const nick = input(m.nick || '', { placeholder: m.username });
  const roles = roleChecklist(m.roles);
  const reason = input('', { placeholder: 'Reason (shows in audit log)' });
  const timeout = select([[0, 'Remove timeout'], [1, '1 minute'], [5, '5 minutes'], [10, '10 minutes'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week'], [40320, '28 days']], 10);
  const del = select([[0, "Don't delete messages"], [3600, 'Last hour'], [86400, 'Last 24 hours'], [604800, 'Last 7 days']], 0);
  const base = G(`/members/${m.id}`);
  const after = () => window.rerender();

  right.append(
    h('div.card',
      h('h3', h('img.avatar', { src: m.avatar, style: { width: '44px', height: '44px' } }), h('span.grow', m.displayName, h('div.small.muted', `@${m.username} · ${m.id}`)),
        h('button.btn.sm', { onclick: () => navigator.clipboard.writeText(m.id).then(() => toast('ID copied')) }, 'Copy ID')),
      h('div.row', h('span.tag', `Joined ${fmtDate(m.joinedAt)}`), h('span.tag', `Account created ${fmtDate(m.createdAt)}`), m.status && h('span.tag', m.status),
        m.timeoutUntil && new Date(m.timeoutUntil) > new Date() && h('span.tag.err', `Timed out until ${fmtDate(m.timeoutUntil)}`)),
      !m.manageable && h('div.banner', { style: { marginTop: '10px' } }, 'The bot can\'t manage this member (owner, or their top role is above the bot\'s).'),
    ),
    h('div.grid.g2',
      h('div.card', h('h3', '🏷️ Nickname & roles'), field('Nickname', nick), field('Roles', roles),
        h('div.row.end', h('button.btn.primary', { onclick: () => act(api('PATCH', base, { nick: nick.value, roles: roles.value(), reason: reason.value }), 'Member updated').then(after) }, '💾 Save'))),
      h('div.card', h('h3', '🔨 Moderation'), field('Reason', reason),
        h('div.row', timeout, h('button.btn', { onclick: () => act(api('PATCH', base, { timeoutMinutes: Number(timeout.value), reason: reason.value }), Number(timeout.value) ? 'Timed out' : 'Timeout removed').then(after) }, '⏱️ Apply timeout')),
        h('hr'),
        h('div.row',
          h('button.btn.danger', { onclick: async () => (await confirmDanger(`Kick ${m.tag}?`)) && act(api('POST', `${base}/kick`, { reason: reason.value }), 'Kicked').then(() => (location.hash = '#/members')) }, '👢 Kick'),
          del,
          h('button.btn.danger', { onclick: async () => (await confirmDanger(`Ban ${m.tag}?`)) && act(api('POST', G('/bans'), { userId: m.id, reason: reason.value, deleteMessageSeconds: Number(del.value) }), 'Banned').then(() => (location.hash = '#/members')) }, '🔨 Ban')),
      ),
    ),
    m.voice && h('div.card', h('h3', '🔊 Voice'),
      h('div.row',
        h('button.btn', { onclick: () => act(api('PATCH', base, { mute: !m.voice.mute }), 'Updated').then(after) }, m.voice.mute ? 'Unmute' : 'Server mute'),
        h('button.btn', { onclick: () => act(api('PATCH', base, { deaf: !m.voice.deaf }), 'Updated').then(after) }, m.voice.deaf ? 'Undeafen' : 'Server deafen'),
        (() => { const c = channelSelect(m.voice.channelId, { types: ['voice', 'stage'] }); return h('span.row', c, h('button.btn', { onclick: () => act(api('PATCH', base, { moveTo: c.value }), 'Moved').then(after) }, 'Move')); })(),
        h('button.btn.danger', { onclick: () => act(api('PATCH', base, { moveTo: null }), 'Disconnected').then(after) }, 'Disconnect'))),
    h('div.card', h('h3', '✉️ Send a DM'), (() => {
      const t = area('', { rows: 3, placeholder: 'Message (they must allow DMs from server members)' });
      return h('div', t, h('div.row.end', h('button.btn', { onclick: () => t.value && act(api('POST', `${base}/dm`, { content: t.value }), 'DM sent') }, 'Send DM')));
    })()),
  );
}

export async function bans(root) {
  if (needGuild(root)) return;
  const list = await api('GET', G('/bans'));
  const uid = input('', { placeholder: 'User ID' });
  const why = input('', { placeholder: 'Reason' });
  root.append(
    h('div.grid.g2',
      h('div.card', h('h3', '🔨 Ban by user ID'), h('p.small.muted', 'Works even if they are not in the server (pre-ban known exploiters / scammers).'),
        h('div.row', h('div.grow', uid), h('div.grow', why), h('button.btn.danger', { onclick: () => uid.value && act(api('POST', G('/bans'), { userId: uid.value.trim(), reason: why.value }), 'Banned').then(window.rerender) }, 'Ban'))),
      (() => {
        const days = select([[1, '1 day'], [7, '7 days'], [30, '30 days']], 30);
        const out = h('span.muted');
        return h('div.card', h('h3', '🧹 Prune inactive members'), h('p.small.muted', 'Kicks members with no roles who haven\'t been online for the chosen time.'),
          h('div.row', 'Inactive for', days,
            h('button.btn', { onclick: () => act(api('POST', G('/prune'), { days: Number(days.value), dry: true })).then((r) => r && (out.textContent = `${r.count} member(s) would be pruned`)) }, 'Preview'),
            h('button.btn.danger', { onclick: async () => (await confirmDanger('Prune (kick) inactive members?')) && act(api('POST', G('/prune'), { days: Number(days.value) }), (r) => `Pruned ${r.count}`) }, 'Prune')), out);
      })(),
    ),
    h('div.card', h('h3', `Banned users (${list.length})`),
      list.length
        ? h('table.t', h('tr', h('th', 'User'), h('th', 'Reason'), h('th', '')),
            list.map((b) => h('tr', h('td', h('div.row', h('img.avatar', { src: b.avatar }), b.tag, h('span.muted.small', b.id))), h('td', b.reason || '—'),
              h('td', h('button.btn.sm', { onclick: () => act(api('DELETE', G(`/bans/${b.id}`)), 'Unbanned').then(window.rerender) }, 'Unban')))))
        : h('div.empty', 'Nobody is banned.')),
  );
}
