import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from './config';
import { PATHS } from './paths';

/** Fill `{{NAME}}` placeholders. Unknown placeholders are an error, so typos can't slip through. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const missing = new Set<string>();
  const out = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      missing.add(key);
      return '';
    }
    return value;
  });
  if (missing.size) throw new Error(`unknown placeholder(s): ${[...missing].join(', ')}`);
  return out;
}

export function renderPrompt(role: Role, vars: Record<string, string>): string {
  const file = join(PATHS.prompts, `${role}.md`);
  try {
    return renderTemplate(readFileSync(file, 'utf8'), vars);
  } catch (err) {
    throw new Error(`harness/prompts/${role}.md: ${(err as Error).message}`);
  }
}
