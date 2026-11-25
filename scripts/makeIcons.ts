/** npm run icons: redraws public/icons/*.png (see iconRender.ts). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderIcons } from './iconRender';

mkdirSync('public/icons', { recursive: true });
for (const [file, bytes] of await renderIcons()) {
  writeFileSync(`public/icons/${file}`, bytes);
  console.log(`public/icons/${file}`);
}
