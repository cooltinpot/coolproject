// Bundles the whole game (JS, three.js and CSS) into a single dist/index.html,
// which is the easiest thing to host: upload one file anywhere (e.g. GitHub Pages).
// Usage: npm install && npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2020',
  alias: { three: join(root, 'vendor/three.module.min.js') },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'style.css'), 'utf8');
let html = readFileSync(join(root, 'index.html'), 'utf8');

const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
  html = html.replace(from, () => to);
};
swap('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
swap('<script type="module" src="src/main.js"></script>', `<script type="module">\n${js}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
