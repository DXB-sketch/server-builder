// npm run check — validates every template in ./templates without touching Discord.
const fs = require('node:fs');
const path = require('node:path');
const { validateTemplate } = require('../src/validate');

const dir = path.join(__dirname, '..', 'templates');
let failed = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  let t;
  try {
    t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch (e) {
    console.log(`✕ ${f}: invalid JSON — ${e.message}`);
    failed++;
    continue;
  }
  const { errors, warnings } = validateTemplate(t);
  console.log(`${errors.length ? '✕' : '✓'} ${f} — ${t.name}: ${errors.length} error(s), ${warnings.length} warning(s)`);
  errors.forEach((e) => console.log(`    error: ${e}`));
  warnings.forEach((w) => console.log(`    warn:  ${w}`));
  if (errors.length) failed++;
}
process.exit(failed ? 1 : 0);
