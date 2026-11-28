/** npm run icons: redraws public/icons/*.png (iconRender.ts) and public/og-image.png (ogRender.ts). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderIcons } from './iconRender';
import { renderOgImage } from './ogRender';

mkdirSync('public/icons', { recursive: true });
for (const [file, bytes] of await renderIcons()) {
  writeFileSync(`public/icons/${file}`, bytes);
  console.log(`public/icons/${file}`);
}
writeFileSync('public/og-image.png', await renderOgImage());
console.log('public/og-image.png');
