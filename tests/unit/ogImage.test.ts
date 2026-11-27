import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OG_HEIGHT, OG_WIDTH, renderOgImage } from '../../scripts/ogRender';
import { SITE_URL } from '../../site.config';

function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('F058 link preview picture', () => {
  it('renders 1200x630 and the same bytes twice', async () => {
    const a = await renderOgImage();
    const b = await renderOgImage();
    expect(pngSize(a)).toEqual({ width: 1200, height: 630 });
    expect([OG_WIDTH, OG_HEIGHT]).toEqual([1200, 630]);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBeLessThan(300 * 1024);
  }, 120_000);
});

describe('F058 site address', () => {
  const host = 'slimsomania.github.io';
  const roots = ['src', 'scripts', 'tests', '.'];
  function sources(dir: string, deep: boolean): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return deep ? sources(path, true) : [];
      return /\.(ts|html|json|webmanifest)$/.test(name) && name !== 'package-lock.json'
        ? [path]
        : [];
    });
  }

  it('is a https address with a trailing slash', () => {
    expect(SITE_URL).toMatch(/^https:\/\/.+\/$/);
    expect(SITE_URL).toContain(host);
  });

  it('is written in exactly one source file (tests aside)', () => {
    const files = [
      ...sources('src', true),
      ...sources('scripts', true),
      ...sources('.', false),
      ...sources('public', true),
    ];
    expect(roots.length).toBeGreaterThan(0);
    const holders = files.filter((f) => readFileSync(f, 'utf8').includes(host));
    expect(holders.map((f) => f.replaceAll('\\', '/'))).toEqual(['site.config.ts']);
  });

  it('builds og:url and og:image from it in index.html', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<meta property="og:url" content="%SITE_URL%" />');
    expect(html).toContain('<meta property="og:image" content="%SITE_URL%og-image.png" />');
    expect(readFileSync('vite.config.ts', 'utf8')).toContain("from './site.config'");
  });
});
