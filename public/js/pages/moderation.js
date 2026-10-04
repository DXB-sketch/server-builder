// AutoMod rules and the audit log.
import { state, api, G, h, act, confirmDanger, field, input, area, check, select, loadGuildData, needGuild, fmtDate, roleChecklist, channelSelect } from '../core.js';

const lines = (s) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

function ruleForm(rule, onSave) {
  const r = rule || { name: '', trigger: 'Keyword', enabled: true, metadata: {}, actions: [{ type: 'BlockMessage' }], exemptRoles: [], exemptChannels: [] };
  const md = r.metadata || {};
  const name = input(r.name);
  const trigger = select(state.meta.automodTriggers, r.trigger, { disabled: !!rule });
  const enabled = check('Enabled', r.enabled);
  const keywords = area((md.keywords || []).join('\n'), { rows: 5, placeholder: 'one per line, * = wildcard (e.g. *robux generator*)' });
  const regex = area((md.regex || []).join('\n'), { rows: 2, placeholder: 'one regex per line (Rust syntax)' });
  const allow = area((md.allow || []).join('\n'), { rows: 2, placeholder: 'words that are always allowed' });
  const presets = state.meta.automodPresets.map((p) => { const c = check(p, (md.presets || []).includes(p)); c.input.value = p; return c; });
  const mentionLimit = input(md.mentionLimit ?? 6, { type: 'number' });
  const raid = check('Mention-raid protection', md.raidProtection);
  const has = (t) => r.actions.find((a) => a.type === t);
  const aBlock = check('Block the message', !!has('BlockMessage'));
  const aMsg = input(has('BlockMessage')?.message || '', { placeholder: 'Custom message shown to the user (optional)' });
  const aAlert = check('Send an alert to:', !!has('SendAlertMessage'));
  const aAlertCh = channelSelect(has('SendAlertMessage')?.channel, { types: ['text'] });
  const aTimeout = check('Time the member out for (seconds):', !!has('Timeout'));
  const aSecs = input(has('Timeout')?.seconds || 600, { type: 'number', style: { width: '120px' } });
  const exRoles = roleChecklist(r.exemptRoles);
  const exCh = area((r.exemptChannels || []).join('\n'), { rows: 2, placeholder: 'channel IDs or names, one per line' });

  const dyn = h('div');
  const renderDyn = () => {
    const t = trigger.value;
    dyn.replaceChildren(
      (t === 'Keyword' || t === 'MemberProfile') && h('div', field('Blocked words / phrases', keywords), field('Regex patterns', regex), field('Allow list', allow)),
      t === 'KeywordPreset' && h('div', field('Presets', h('div', presets)), field('Allow list', allow)),
      t === 'MentionSpam' && h('div', field('Max unique @mentions per message', mentionLimit), raid),
      t === 'Spam' && h('p.small.muted', 'Discord\'s built-in spam detection. Only Block + Alert actions are allowed.'),
    );
  };
  trigger.addEventListener('change', renderDyn);
  renderDyn();

  return h('div',
    h('div.row', h('div.grow', field('Rule name', name)), field('Trigger', trigger), enabled),
    dyn,
    h('h4', 'Actions'),
    h('div', aBlock, aMsg), h('div.row', aAlert, aAlertCh), h('div.row', aTimeout, aSecs),
    h('h4', 'Exemptions'), h('div.grid.g2', field('Exempt roles', exRoles), field('Exempt channels', exCh)),
    h('div.row.end', h('button.btn.primary', { onclick: () => {
      const actions = [];
      if (aBlock.input.checked) actions.push({ type: 'BlockMessage', message: aMsg.value || undefined });
      if (aAlert.input.checked && aAlertCh.value) actions.push({ type: 'SendAlertMessage', channel: aAlertCh.value });
      if (aTimeout.input.checked) actions.push({ type: 'Timeout', seconds: Number(aSecs.value) });
      onSave({
        name: name.value, trigger: trigger.value, enabled: enabled.input.checked, actions,
        metadata: {
          keywords: lines(keywords.value), regex: lines(regex.value), allow: lines(allow.value),
          presets: presets.filter((c) => c.input.checked).map((c) => c.input.value),
          mentionLimit: Number(mentionLimit.value), raidProtection: raid.input.checked,
        },
        exemptRoles: exRoles.value(), exemptChannels: lines(exCh.value),
      });
    } }, '💾 Save rule')),
  );
}

export async function automod(root) {
  if (needGuild(root)) return;
  await loadGuildData();
  const rules = await api('GET', G('/automod'));
  const sel = location.hash.split('?')[1];
  const list = h('div.list', rules.map((r) => h('div.item', { class: r.id === sel ? 'sel' : '', onclick: () => (location.hash = `#/automod?${r.id}`) },
    h('span.name', r.name), h('span.tag', r.trigger), r.enabled ? h('span.tag.ok', 'on') : h('span.tag.err', 'off'))));
  const left = h('div.card', h('h3', h('span.grow', '🛡️ AutoMod rules'), h('a.btn.sm.primary', { href: '#/automod?new' }, '+ New')), list,
    h('p.small.muted', 'Limits: 6 keyword rules, 1 spam, 1 mention-spam, 1 preset rule, 1 member-profile rule.'));
  const right = h('div');
  root.append(h('div.split', left, right));
  if (sel === 'new') {
    right.append(h('div.card', h('h3', 'New rule'), ruleForm(null, async (body) => {
      const r = await act(api('POST', G('/automod'), body), 'Rule created');
      if (r) location.hash = `#/automod?${r.id}`;
    })));
  } else {
    const r = rules.find((x) => x.id === sel);
    if (!r) return right.append(h('div.card.empty', 'Select a rule or create a new one.'));
    right.append(h('div.card', h('h3', h('span.grow', r.name), h('button.btn.sm.danger', { onclick: async () => {
      if (await confirmDanger(`Delete rule "${r.name}"?`)) if (await act(api('DELETE', G(`/automod/${r.id}`)), 'Deleted')) location.hash = '#/automod';
    } }, 'Delete')), ruleForm(r, (body) => act(api('PATCH', G(`/automod/${r.id}`), body), 'Rule saved').then(window.rerender))));
  }
}

export async function audit(root) {
  if (needGuild(root)) return;
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const type = select([['', 'All actions'], ...state.meta.auditLogEvents], q.get('type') || '');
  const user = input(q.get('user') || '', { placeholder: 'Executor user ID' });
  const go = () => (location.hash = `#/audit?type=${type.value}&user=${user.value}`);
  root.append(h('div.card', h('div.row', type, h('div', { style: { width: '240px' } }, user), h('button.btn', { onclick: go }, 'Filter'))));
  const entries = await api('GET', G(`/audit?limit=100${q.get('type') ? `&type=${q.get('type')}` : ''}${q.get('user') ? `&user=${q.get('user')}` : ''}`));
  root.append(h('div.card',
    entries.length
      ? h('table.t', h('tr', h('th', 'When'), h('th', 'Action'), h('th', 'By'), h('th', 'Target'), h('th', 'Reason / changes')),
          entries.map((e) => h('tr', h('td.small', fmtDate(e.createdAt)), h('td', h('span.tag.acc', e.action)), h('td', e.executor), h('td', e.target ?? '—'),
            h('td.small', e.reason && h('div', '📝 ' + e.reason), (e.changes || []).slice(0, 6).map((c) => h('div.muted', `${c.key}: ${JSON.stringify(c.old ?? null)} → ${JSON.stringify(c.new ?? null)}`.slice(0, 200)))))))
      : h('div.empty', 'No entries.')));
}
