// Checks a template for mistakes before it touches Discord: unknown permissions,
// typos in role / channel names, and Discord's size limits.
const {
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
  GuildVerificationLevel,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
} = require('discord.js');
const { PERMISSION_NAMES, norm } = require('./util');

const TYPES = ['text', 'voice', 'category', 'announcement', 'news', 'stage', 'forum', 'media'];

function validateTemplate(t) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  if (!t || typeof t !== 'object') return { errors: ['Template is not an object'], warnings };
  if (!t.name) err('Template needs a "name"');

  const checkPerms = (list, where) => {
    if (list === undefined || list === 'ALL') return;
    if (!Array.isArray(list)) return err(`${where}: permissions must be a list`);
    for (const p of list) if (p !== 'ALL' && !PERMISSION_NAMES.includes(p)) err(`${where}: unknown permission "${p}"`);
  };
  const enumCheck = (obj, v, where) => {
    if (v === undefined || typeof v === 'number') return;
    if (!Object.keys(obj).some((k) => k.toLowerCase() === String(v).toLowerCase())) err(`${where}: unknown value "${v}"`);
  };

  // roles
  const roleNames = new Set(['@everyone', 'everyone', '@bot']);
  for (const [i, r] of (t.roles || []).entries()) {
    const where = `roles[${i}] ${r.name || ''}`;
    if (!r.name) err(`${where}: missing name`);
    else if (r.name.length > 100) err(`${where}: name longer than 100 characters`);
    if (roleNames.has(norm(r.name))) warn(`${where}: duplicate role name`);
    roleNames.add(norm(r.name));
    if (r.color && !/^#?[0-9a-f]{6}$/i.test(String(r.color)) && typeof r.color !== 'number') err(`${where}: color must look like #RRGGBB`);
    checkPerms(r.permissions, where);
  }
  if ((t.roles || []).length > 250) err('Discord allows at most 250 roles');
  checkPerms(t.everyone?.permissions, '@everyone');
  const hasRole = (n) => roleNames.has(norm(n)) || roleNames.has(n);

  const checkOverwrites = (obj, where) => {
    for (const [name, o] of Object.entries(obj || {})) {
      if (!hasRole(name)) warn(`${where}: permissions mention role "${name}" which is not in this template (must already exist in the server)`);
      checkPerms(o.allow, `${where} → ${name} allow`);
      checkPerms(o.deny, `${where} → ${name} deny`);
    }
  };

  // channels
  const channelNames = new Set();
  let total = 0;
  const checkChannel = (c, where) => {
    total++;
    if (!c.name) return err(`${where}: missing name`);
    if (c.name.length > 100) err(`${where}: name longer than 100 characters`);
    const type = String(c.type || 'text').toLowerCase();
    if (!TYPES.includes(type)) err(`${where}: unknown type "${c.type}" (use ${TYPES.join(', ')})`);
    if (channelNames.has(norm(c.name))) warn(`${where}: duplicate channel name "${c.name}" — only the first is matched when re-running`);
    channelNames.add(norm(c.name));
    const topicMax = ['forum', 'media'].includes(type) ? 4096 : 1024;
    if (c.topic && c.topic.length > topicMax) err(`${where}: topic longer than ${topicMax}`);
    if (c.slowmode !== undefined && (c.slowmode < 0 || c.slowmode > 21600)) err(`${where}: slowmode must be 0–21600 seconds`);
    if (c.userLimit !== undefined && (c.userLimit < 0 || c.userLimit > 99)) err(`${where}: userLimit must be 0–99`);
    if (c.tags) {
      if (c.tags.length > 20) err(`${where}: max 20 forum tags`);
      for (const tg of c.tags) if ((typeof tg === 'string' ? tg : tg.name || '').length > 20) err(`${where}: tag "${tg.name || tg}" longer than 20 characters`);
    }
    checkOverwrites(c.permissions, where);
  };
  for (const [i, c] of (t.channels || []).entries()) checkChannel(c, `channels[${i}] ${c.name || ''}`);
  for (const [i, cat] of (t.categories || []).entries()) {
    const where = `category ${cat.name || i}`;
    if (!cat.name) err(`${where}: missing name`);
    total++;
    checkOverwrites(cat.permissions, where);
    if ((cat.channels || []).length > 50) err(`${where}: max 50 channels per category`);
    for (const [j, c] of (cat.channels || []).entries()) checkChannel(c, `${cat.name} → ${c.name || j}`);
  }
  if (total > 500) err('Discord allows at most 500 channels');
  const hasChannel = (n) => channelNames.has(norm(n));

  // settings
  const s = t.settings || {};
  enumCheck(GuildVerificationLevel, s.verificationLevel, 'settings.verificationLevel');
  enumCheck(GuildDefaultMessageNotifications, s.defaultMessageNotifications, 'settings.defaultMessageNotifications');
  enumCheck(GuildExplicitContentFilter, s.explicitContentFilter, 'settings.explicitContentFilter');
  for (const k of ['rulesChannel', 'publicUpdatesChannel', 'systemChannel', 'afkChannel', 'safetyAlertsChannel']) {
    if (s[k] && !hasChannel(s[k])) warn(`settings.${k}: channel "${s[k]}" is not in this template`);
  }
  if (s.name && (s.name.length < 2 || s.name.length > 100)) err('settings.name must be 2–100 characters');

  // placeholders in text
  const checkText = (text, where) => {
    if (typeof text !== 'string') return;
    for (const [, n] of text.matchAll(/\{\{channel:([^}]+)\}\}/g)) if (!hasChannel(n)) warn(`${where}: {{channel:${n}}} — no such channel in template`);
    for (const [, n] of text.matchAll(/\{\{role:([^}]+)\}\}/g)) if (!hasRole(n)) warn(`${where}: {{role:${n}}} — no such role in template`);
  };

  // messages
  for (const [i, m] of (t.messages || []).entries()) {
    const where = `messages[${i}] (#${m.channel})`;
    if (!hasChannel(m.channel)) warn(`${where}: channel not in template`);
    if (m.content && m.content.length > 2000) err(`${where}: content longer than 2000`);
    checkText(m.content, where);
    if ((m.embeds || []).length > 10) err(`${where}: max 10 embeds`);
    let size = 0;
    for (const e of m.embeds || []) {
      if (e.title?.length > 256) err(`${where}: embed title longer than 256`);
      if (e.description?.length > 4096) err(`${where}: embed description longer than 4096`);
      if ((e.fields || []).length > 25) err(`${where}: max 25 embed fields`);
      for (const f of e.fields || []) {
        if (!f.name || !f.value) err(`${where}: embed fields need a name and value`);
        if (f.name?.length > 256) err(`${where}: field name longer than 256`);
        if (f.value?.length > 1024) err(`${where}: field "${f.name}" value longer than 1024`);
        checkText(f.value, where);
        size += (f.name || '').length + (f.value || '').length;
      }
      size += (e.title || '').length + (e.description || '').length + (e.footer?.text || '').length;
      checkText(e.description, where);
    }
    if (size > 6000) err(`${where}: embeds longer than 6000 characters in total`);
    if ((m.buttons || []).length > 25) err(`${where}: max 25 buttons`);
    for (const b of m.buttons || []) {
      if (b.label && b.label.length > 80) err(`${where}: button label longer than 80`);
      if (b.role && !hasRole(b.role)) warn(`${where}: button role "${b.role}" not in template`);
      if (!b.role && !b.url) err(`${where}: button "${b.label}" needs a role or url`);
    }
  }

  // bot settings & welcome screen
  if (t.bot?.welcome?.channel && !hasChannel(t.bot.welcome.channel)) warn(`bot.welcome.channel "${t.bot.welcome.channel}" not in template`);
  if (t.bot?.logChannel && !hasChannel(t.bot.logChannel)) warn(`bot.logChannel "${t.bot.logChannel}" not in template`);
  for (const r of t.bot?.autoRoles || []) if (!hasRole(r)) warn(`bot.autoRoles: "${r}" not in template`);
  if (t.welcomeScreen?.channels?.length > 5) err('welcomeScreen: max 5 channels');
  for (const c of t.welcomeScreen?.channels || []) if (!hasChannel(c.channel)) warn(`welcomeScreen: channel "${c.channel}" not in template`);

  // automod
  const counts = {};
  for (const [i, r] of (t.automod || []).entries()) {
    const where = `automod[${i}] ${r.name || ''}`;
    if (!r.name) err(`${where}: missing name`);
    enumCheck(AutoModerationRuleTriggerType, r.trigger, `${where} trigger`);
    counts[r.trigger] = (counts[r.trigger] || 0) + 1;
    for (const a of r.actions || []) {
      enumCheck(AutoModerationActionType, a.type, `${where} action`);
      if (a.channel && !hasChannel(a.channel)) warn(`${where}: alert channel "${a.channel}" not in template`);
      if (a.type === 'Timeout' && !['Keyword', 'MentionSpam', 'MemberProfile'].includes(r.trigger)) err(`${where}: Timeout action only works with Keyword / MentionSpam rules`);
      if (a.message && a.message.length > 150) err(`${where}: custom block message longer than 150`);
    }
    for (const p of r.metadata?.presets || []) enumCheck(AutoModerationRuleKeywordPresetType, p, `${where} preset`);
    if ((r.metadata?.keywords || []).length > 1000) err(`${where}: max 1000 keywords`);
    for (const k of r.metadata?.keywords || []) if (k.length > 60) err(`${where}: keyword "${k}" longer than 60`);
    for (const n of r.exemptRoles || []) if (!hasRole(n)) warn(`${where}: exempt role "${n}" not in template`);
  }
  if ((counts.Keyword || 0) > 6) err('automod: max 6 Keyword rules');
  for (const k of ['Spam', 'KeywordPreset', 'MentionSpam', 'MemberProfile']) if ((counts[k] || 0) > 1) err(`automod: only 1 ${k} rule allowed`);

  return { errors, warnings };
}

module.exports = { validateTemplate };
