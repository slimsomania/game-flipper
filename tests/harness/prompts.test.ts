import { describe, expect, it } from 'vitest';
import { ROLES } from '../../harness/lib/config';
import { renderPrompt, renderTemplate } from '../../harness/lib/prompts';

/** The same placeholders harness/run.ts provides. */
const VARS: Record<string, string> = {
  SESSION: '12',
  BRIEFING: '- Session 12',
  PLAN_MODE: 'initial',
  FEATURE_ID: 'F007',
  FEATURE_TITLE: 'Throw the bottle',
  FEATURE_JSON: '{ "id": "F007" }',
  ATTEMPT: '1',
  MAX_ATTEMPTS: '3',
  DONE_STATUS: 'needs_review',
  REVIEW_FEEDBACK_BLOCK: '',
  REVIEW_RANGE: 'abc12345..HEAD',
};

describe('prompt templates', () => {
  it.each(ROLES)('%s.md renders with the harness placeholders', (role) => {
    const prompt = renderPrompt(role, VARS);
    expect(prompt).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    expect(prompt.length).toBeGreaterThan(500);
  });

  it('rejects unknown placeholders', () => {
    expect(() => renderTemplate('Hello {{NAME}}', {})).toThrow(/NAME/);
  });
});
