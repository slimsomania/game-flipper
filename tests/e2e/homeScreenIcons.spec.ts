import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ICONS, renderIcons } from '../../scripts/iconRender';

// F047: the icon script is deterministic, so the committed PNGs are what `npm run icons` makes.
test('a fresh render of the icons equals the committed PNGs byte for byte', async () => {
  const fresh = await renderIcons();
  expect([...fresh.keys()]).toEqual(ICONS.map((icon) => icon.file));
  for (const [file, bytes] of fresh) {
    const committed = readFileSync(`public/icons/${file}`);
    expect(bytes.equals(committed), file).toBe(true);
  }
});
