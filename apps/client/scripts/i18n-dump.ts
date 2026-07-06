// Dumps the English catalog to a flat JSON reference (scripts/i18n.en.json)
// for the translation pass, and prints coverage stats for each locale file
// under src/i18n/locales/. Run: pnpm --filter client exec tsx scripts/i18n-dump.ts
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { en } from '../src/i18n/en';

const here = dirname(fileURLToPath(import.meta.url));
const keys = Object.keys(en) as (keyof typeof en)[];

const out = join(here, 'i18n.en.json');
writeFileSync(out, JSON.stringify(en, null, 2) + '\n');
console.log(`English catalog: ${keys.length} keys → ${out}`);

const localesDir = join(here, '..', 'src', 'i18n', 'locales');
if (existsSync(localesDir)) {
  const files = readdirSync(localesDir).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    const mod = await import(join(localesDir, f));
    const cat = (mod.default ?? {}) as Record<string, string>;
    const have = keys.filter((k) => typeof cat[k] === 'string' && cat[k].length > 0).length;
    const extra = Object.keys(cat).filter((k) => !(k in en));
    console.log(
      `  ${f}: ${have}/${keys.length} translated` +
        (extra.length ? ` — ${extra.length} unknown keys: ${extra.slice(0, 5).join(', ')}` : ''),
    );
  }
} else {
  console.log('  (no locales/ dir yet)');
}
