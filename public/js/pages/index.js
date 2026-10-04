import { dashboard, templates } from './build.js';
import { server, roles, channels } from './server.js';
import { messages } from './messages.js';
import { members, bans } from './members.js';
import { automod, audit } from './moderation.js';
import { events, emojis, invites, webhooks, threads } from './extras.js';
import { bot, raw, logs } from './bot.js';

export default { dashboard, templates, server, roles, channels, messages, threads, members, bans, automod, audit, events, emojis, invites, webhooks, bot, raw, logs };
