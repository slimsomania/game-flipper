import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Enforces the layering rules from CLAUDE.md and docs/ARCHITECTURE.md, so they hold no matter
 * which agent wrote the code.
 */

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Remove comments so that prose mentioning a forbidden API doesn't count as using it. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CORE_RULES: [RegExp, string][] = [
  [/from\s+['"]phaser['"]|import\(\s*['"]phaser['"]\s*\)/, 'imports Phaser'],
  [/\bMath\.random\s*\(/, 'uses Math.random() (use createRng from core/rng)'],
  [/\b(?:Date\.now|performance\.now)\s*\(|\bnew\s+Date\s*\(/, 'reads the wall clock'],
  [/\b(?:window|document|localStorage|sessionStorage|navigator)\s*\./, 'uses browser APIs'],
];

describe('architecture rules', () => {
  it('keeps src/core pure and deterministic', () => {
    const problems: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'src', 'core'))) {
      const text = code(file);
      for (const [pattern, what] of CORE_RULES) {
        if (pattern.test(text)) problems.push(`${relative(ROOT, file)} ${what}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps physics behind src/core (src/game never imports planck)', () => {
    const problems = sourceFiles(join(ROOT, 'src', 'game'))
      .filter((file) => /from\s+['"]planck['"]/.test(code(file)))
      .map((file) => `${relative(ROOT, file)} imports planck directly`);
    expect(problems).toEqual([]);
  });
});
