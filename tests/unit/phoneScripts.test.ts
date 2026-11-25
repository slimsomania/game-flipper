import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const readme = readFileSync('README.md', 'utf8');

describe('phone scripts (F044)', () => {
  it('dev:phone runs Vite on the network', () => {
    expect(pkg.scripts['dev:phone']).toMatch(/^vite\b.*--host\b/);
    expect(pkg.scripts['dev:phone']).not.toMatch(/preview|build/);
  });
  it('preview:phone builds, then serves the build on the network', () => {
    expect(pkg.scripts['preview:phone']).toMatch(/^vite build && vite preview\b.*--host\b/);
  });
  it('verify runs neither (they never exit)', () => {
    expect(pkg.scripts.verify).not.toMatch(/phone|preview|dev\b/);
  });
  it('the README has an "On a phone" part with both commands, ipconfig, firewall and ?debug', () => {
    expect(readme).toContain('On a phone');
    const part = readme.slice(readme.indexOf('On a phone'));
    for (const word of [
      'npm run dev:phone',
      'npm run preview:phone',
      'ipconfig',
      'firewall',
      '?debug',
    ]) {
      expect(part).toContain(word);
    }
  });
});
