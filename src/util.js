// Shared helpers: permission names, enum names, colours, text placeholders.
const {
  PermissionsBitField,
  PermissionFlagsBits,
  ChannelType,
  GuildVerificationLevel,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
  ButtonStyle,
} = require('discord.js');

const PERMISSION_NAMES = Object.keys(PermissionFlagsBits);

/** Turn ["ViewChannel", "SendMessages"] (or "ALL" / a bigint string) into a bigint. */
function perms(list, warn = () => {}) {
  if (list == null) return 0n;
  if (typeof list === 'bigint') return list;
  if (typeof list === 'string' && /^\d+$/.test(list)) return BigInt(list);
  if (list === 'ALL' || (Array.isArray(list) && list.includes('ALL'))) return PermissionsBitField.All;
  const arr = Array.isArray(list) ? list : [list];
  let bits = 0n;
  for (const name of arr) {
    if (PermissionFlagsBits[name] === undefined) {
      warn(`Unknown permission "${name}" ignored`);
      continue;
    }
    bits |= PermissionFlagsBits[name];
  }
  return bits;
}

/** bigint → ["ViewChannel", ...] */
function permNames(bits) {
  return new PermissionsBitField(BigInt(bits)).toArray();
}

const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
  news: ChannelType.GuildAnnouncement,
  stage: ChannelType.GuildStageVoice,
  forum: ChannelType.GuildForum,
  media: ChannelType.GuildMedia,
};
const CHANNEL_TYPE_NAMES = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildCategory]: 'category',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildStageVoice]: 'stage',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'media',
  [ChannelType.PublicThread]: 'thread',
  [ChannelType.PrivateThread]: 'private-thread',
  [ChannelType.AnnouncementThread]: 'announcement-thread',
  [ChannelType.GuildDirectory]: 'directory',
};

function channelType(name) {
  if (typeof name === 'number') return name;
  const t = CHANNEL_TYPES[String(name || 'text').toLowerCase()];
  if (t === undefined) throw new Error(`Unknown channel type "${name}"`);
  return t;
}

/** Accept enum by name ("Medium") or number. */
function enumValue(enumObj, value) {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;
  if (/^\d+$/.test(String(value))) return Number(value);
  if (enumObj[value] !== undefined) return enumObj[value];
  const key = Object.keys(enumObj).find((k) => k.toLowerCase() === String(value).toLowerCase());
  if (key === undefined) throw new Error(`Unknown value "${value}"`);
  return enumObj[key];
}

function enumName(enumObj, value) {
  return Object.keys(enumObj).find((k) => enumObj[k] === value && isNaN(Number(k))) ?? value;
}

const ENUMS = {
  verificationLevel: GuildVerificationLevel,
  defaultMessageNotifications: GuildDefaultMessageNotifications,
  explicitContentFilter: GuildExplicitContentFilter,
  buttonStyle: ButtonStyle,
};

function color(c) {
  if (c == null || c === '') return undefined;
  if (typeof c === 'number') return c;
  return parseInt(String(c).replace('#', ''), 16);
}

function hex(n) {
  return '#' + Number(n || 0).toString(16).padStart(6, '0');
}

/** Normalise a channel/role name for matching (Discord lowercases text-channel names). */
function norm(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Replace placeholders in a string:
 *   {{env.NAME}}     -> process.env.NAME (or the fallback text)
 *   {{role:Name}}    -> role mention
 *   {{channel:name}} -> channel mention
 *   {{server}}       -> guild name
 */
function fill(text, guild) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\{\{env\.([A-Z0-9_]+)\}\}/g, (_, k) => process.env[k] || '*(link coming soon)*')
    .replace(/\{\{role:([^}]+)\}\}/g, (m, n) => {
      const r = guild?.roles.cache.find((x) => norm(x.name) === norm(n));
      return r ? `<@&${r.id}>` : `@${n}`;
    })
    .replace(/\{\{channel:([^}]+)\}\}/g, (m, n) => {
      const c = guild?.channels.cache.find((x) => norm(x.name) === norm(n));
      return c ? `<#${c.id}>` : `#${n}`;
    })
    .replace(/\{\{server\}\}/g, guild?.name ?? '');
}

/** Deep-apply fill() to every string in an object. */
function fillDeep(obj, guild) {
  if (typeof obj === 'string') return fill(obj, guild);
  if (Array.isArray(obj)) return obj.map((x) => fillDeep(x, guild));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = fillDeep(v, guild);
    return out;
  }
  return obj;
}

/** Convert a template embed (hex colours, etc.) into an API embed. */
function embed(e, guild) {
  const out = fillDeep(e, guild);
  if (out.color !== undefined) out.color = color(out.color);
  if (out.timestamp === true) out.timestamp = new Date().toISOString();
  return out;
}

/** data:...;base64,xxx -> Buffer, http(s) URL / Buffer passthrough. */
function toBufferish(src) {
  if (typeof src === 'string' && src.startsWith('data:')) {
    return Buffer.from(src.split(',')[1], 'base64');
  }
  return src;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  PERMISSION_NAMES,
  perms,
  permNames,
  channelType,
  CHANNEL_TYPE_NAMES,
  enumValue,
  enumName,
  ENUMS,
  color,
  hex,
  norm,
  fill,
  fillDeep,
  embed,
  toBufferish,
  sleep,
};
