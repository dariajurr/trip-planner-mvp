// Checks the contrast (WCAG 2.1 AA) of every colour theme in src/app/shared/_themes.scss.
// Usage: npm run check:themes. A theme that fails is reported and the script exits with 1.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/shared/_themes.scss', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const themes = {};
for (const block of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const names = [...block[1].matchAll(/\[data-theme='([\w-]+)'\]/g)].map(m => m[1]);
  const vars = Object.fromEntries([...block[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(m => [m[1], m[2]]));
  for (const name of names) themes[name] = { ...themes[name], ...vars };
}

const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum ratio]
const PAIRS = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'accent-soft', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'surface', 4.5], ['muted', 'accent-soft', 3],
  ['accent', 'bg', 4.5], ['accent', 'surface', 4.5], ['accent', 'accent-soft', 4.5],
  ['on-accent', 'accent', 4.5],
  ['warn', 'warn-soft', 4.5], ['warn', 'bg', 4.5], ['warn', 'surface', 4.5],
  ['danger', 'bg', 4.5], ['danger', 'surface', 4.5],
];
const REQUIRED = ['bg', 'surface', 'text', 'muted', 'accent', 'accent-soft', 'border', 'danger', 'warn-soft', 'warn', 'on-accent', 'chrome'];

let failed = false;
for (const [name, vars] of Object.entries(themes)) {
  const missing = REQUIRED.filter(v => !vars[v]);
  if (missing.length) {
    console.log(`FAIL ${name}: missing ${missing.join(', ')}`);
    failed = true;
    continue;
  }
  const bad = PAIRS.map(([f, b, min]) => ({ f, b, min, r: ratio(vars[f], vars[b]) })).filter(p => p.r < p.min);
  const worst = Math.min(...PAIRS.map(([f, b]) => ratio(vars[f], vars[b])));
  if (bad.length) {
    failed = true;
    console.log(`FAIL ${name}: ${bad.map(p => `${p.f} on ${p.b} = ${p.r.toFixed(2)} (needs ${p.min})`).join('; ')}`);
  } else {
    console.log(`ok   ${name.padEnd(9)} lowest contrast ${worst.toFixed(2)}`);
  }
}
if (!Object.keys(themes).length) {
  console.log('FAIL no themes found');
  failed = true;
}
process.exit(failed ? 1 : 0);
