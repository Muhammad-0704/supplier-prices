/**
 * Собирает src/app/tokens.css из design/tokens.json (тот же файл, что в дизайн-системе «Прайс-доска»).
 * Запуск: npm run tokens. После правки токенов в дизайн-системе скопируйте tokens.json сюда и перезапустите.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type V = string | Record<string, string>;
interface Tok { name: string; value: V; usage?: string }
interface Style { name: string; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing?: string }

const root = join(__dirname, '..');
const t = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
const themes: string[] = t.color.themes.map((x: { id: string }) => x.id);
const [first, ...rest] = themes;

const val = (v: V, theme: string) => (typeof v === 'string' ? v : v[theme] ?? v[first]);
const colorish: Tok[] = [...t.color.tokens, ...(t.shadow?.tokens ?? [])];
const decl = (theme: string) => colorish.map((k) => `  --${k.name}: ${val(k.value, theme)};`).join('\n');

const plain: Tok[] = ['spacing', 'radius', 'size'].flatMap((f) => t[f]?.tokens ?? []);
const families = Object.entries(t.type.families as Record<string, string>).map(([k, v]) => `  --font-${k}: ${v};`);

const styles: string[] = [];
for (const g of t.type.groups as { family: string; styles: Style[] }[]) {
  for (const s of g.styles) {
    styles.push(`.t-${s.name} { font-family: var(--font-${g.family}); font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight};${s.letterSpacing ? ` letter-spacing: ${s.letterSpacing};` : ''} }`);
  }
}

const darkOnes = rest.map((id) => `
@media (prefers-color-scheme: ${id}) {
  :root:not([data-theme="${first}"]) {
${decl(id).replace(/^/gm, '  ')}
    color-scheme: ${id};
  }
}
:root[data-theme="${id}"] {
${decl(id)}
  color-scheme: ${id};
}`).join('\n');

const css = `/* ${t.name} — generated from design/tokens.json. Не правьте руками: npm run tokens */
:root {
${decl(first)}
${plain.map((k) => `  --${k.name}: ${k.value};`).join('\n')}
${families.join('\n')}
  color-scheme: ${first};
}
${darkOnes}

${styles.join('\n')}
`;

writeFileSync(join(root, 'src/app/tokens.css'), css);
console.log('tokens.css: ', colorish.length, 'цветов,', plain.length, 'размеров,', styles.length, 'стилей текста');
