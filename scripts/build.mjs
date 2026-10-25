import { build as esbuild } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile, access, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const DIST = 'dist';
const FONT_PACKAGES = [
  'open-sans', 'atkinson-hyperlegible', 'lato', 'montserrat', 'raleway', 'lora',
  'eb-garamond', 'cormorant-garamond', 'crimson-text', 'playfair-display', 'cinzel',
];
const FONT_CSS = ['400.css', '600.css', '700.css', '400-italic.css'];
const KEEP_SUBSETS = ['latin', 'cyrillic'];   // latin also keeps latin-ext; cyrillic also keeps cyrillic-ext

const exists = (p) => access(p).then(() => true, () => false);

async function bundle(entry, outfile) {
  await esbuild({
    entryPoints: [entry], outfile, bundle: true, format: 'iife',
    target: 'es2020', minify: false, legalComments: 'none', logLevel: 'warning',
  });
}

/** Concatenate fontsource font-face rules, keep only wanted subsets, copy the woff2 files. */
async function buildFonts() {
  await mkdir(`${DIST}/fonts`, { recursive: true });
  const faces = [];
  const copied = new Set();

  for (const pkg of FONT_PACKAGES) {
    const base = `node_modules/@fontsource/${pkg}`;
    for (const cssName of FONT_CSS) {
      if (!(await exists(`${base}/${cssName}`))) continue;
      const css = await readFile(`${base}/${cssName}`, 'utf8');
      for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
        const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
        if (!file || !KEEP_SUBSETS.some((s) => file.includes(`-${s}-`))) continue;
        if (!copied.has(file)) {
          await cp(`${base}/files/${file}`, `${DIST}/fonts/${file}`);
          copied.add(file);
        }
        faces.push(block.replace(/src:[^;]+;/, `src: url(../fonts/${file}) format('woff2');`));
      }
    }
  }
  await mkdir(`${DIST}/css`, { recursive: true });
  await writeFile(`${DIST}/css/fonts.css`, faces.join('\n') + '\n');
}

/** data/bible/KJV.json becomes dist/bible/KJV.js, a classic script, since fetch() fails over file:/// */
async function buildBibles() {
  if (!(await exists('data/bible'))) return;
  await mkdir(`${DIST}/bible`, { recursive: true });
  for (const file of await readdir('data/bible')) {
    if (!file.endsWith('.json')) continue;
    const id = path.basename(file, '.json');
    const json = await readFile(`data/bible/${file}`, 'utf8');
    await writeFile(`${DIST}/bible/${id}.js`,
      `globalThis.__BIBLE__ = globalThis.__BIBLE__ || {};\nglobalThis.__BIBLE__[${JSON.stringify(id)}] = ${json.trim()};\n`);
  }
}

const DOCK_SHEETS = ['tokens', 'base', 'live-bar', 'tabs', 'fields', 'cards', 'banners', 'plan', 'extras'];

/** The dock sheets are small and ordered; the browser gets them as one file. */
async function buildDockCss() {
  const parts = [];
  for (const name of DOCK_SHEETS) parts.push(await readFile(`src/css/dock/${name}.css`, 'utf8'));
  await mkdir(`${DIST}/css`, { recursive: true });
  await writeFile(`${DIST}/css/dock.css`, parts.join(String.fromCharCode(10)));
}

export async function build() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(`${DIST}/css`, { recursive: true });
  await mkdir(`${DIST}/assets`, { recursive: true });

  await bundle('src/overlay/main.js', `${DIST}/overlay.js`);
  await cp('src/html/overlay.html', `${DIST}/overlay.html`);

  await bundle('src/dock/main.js', `${DIST}/dock.js`);
  await cp('src/html/dock.html', `${DIST}/dock.html`);

  await cp('src/css/overlay.css', `${DIST}/css/overlay.css`);
  await buildDockCss();
  await cp('src/assets/bg1.png', `${DIST}/assets/bg1.png`);
  await buildFonts();
  await buildBibles();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build();
  console.log('dist/ built');
}
