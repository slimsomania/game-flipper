import { describe, expect, it } from 'vitest';
import {
  buildArgs,
  classifyOutcome,
  parseRateLimitEvent,
  parseResetTime,
  type ResultEvent,
} from '../../harness/lib/claude';
import { DEFAULT_CONFIG, parseConfig } from '../../harness/lib/config';

const ok: ResultEvent = { type: 'result', subtype: 'success', is_error: false, result: 'Done.' };

/** Shape of the event Claude Code 2.1 emits in stream-json mode (captured from a real session). */
const rateLimitEvent = (status: string) => ({
  type: 'rate_limit_event',
  rate_limit_info: {
    status,
    resetsAt: 1794608400,
    rateLimitType: 'five_hour',
    unifiedWindows: {
      five_hour: { utilization: 0.36, resetsAt: 1794608400, status },
      seven_day: { utilization: 0.05, resetsAt: 1795186800, status: 'allowed' },
    },
  },
});

describe('parseRateLimitEvent', () => {
  it('reads status, reset time and utilization of both windows', () => {
    const info = parseRateLimitEvent(rateLimitEvent('allowed'));
    expect(info).toMatchObject({ status: 'allowed', type: 'five_hour' });
    expect(info?.resetsAt?.getTime()).toBe(1794608400 * 1000);
    expect(info?.fiveHour.utilization).toBe(0.36);
    expect(info?.sevenDay.utilization).toBe(0.05);
    expect(info?.sevenDay.resetsAt?.getTime()).toBe(1795186800 * 1000);
  });

  it('returns null for other events', () => {
    expect(parseRateLimitEvent({ type: 'assistant' })).toBeNull();
  });

  it('turns a failed session into a usage limit when the event says so', () => {
    const failed: ResultEvent = { type: 'result', subtype: 'success', is_error: true, result: '' };
    const limited = parseRateLimitEvent(rateLimitEvent('rejected'));
    expect(classifyOutcome(failed, '', 1, false, false, limited).outcome).toBe('usage_limit');
    const allowed = parseRateLimitEvent(rateLimitEvent('allowed'));
    expect(classifyOutcome(failed, '', 1, false, false, allowed).outcome).toBe('error');
    expect(
      classifyOutcome({ ...failed, api_error_status: 529 }, '', 1, false, false, allowed).outcome,
    ).toBe('transient');
  });
});

describe('parseConfig', () => {
  it('fills in defaults and validates values', () => {
    expect(parseConfig({}).pauseAtUsagePercent).toBe(DEFAULT_CONFIG.pauseAtUsagePercent);
    expect(parseConfig({ models: { builder: 'sonnet' } }).models).toMatchObject({
      builder: 'sonnet',
      planner: null,
    });
    expect(() => parseConfig({ pauseAtUsagePercent: 150 })).toThrow(/pauseAtUsagePercent/);
    expect(() => parseConfig({ maxSessions: -1 })).toThrow(/maxSessions/);
  });

  it('pushes after each session unless turned off', () => {
    expect(parseConfig({}).pushAfterSession).toBe(true);
    expect(parseConfig({ pushAfterSession: false }).pushAfterSession).toBe(false);
    expect(() => parseConfig({ pushAfterSession: 'yes' })).toThrow(/pushAfterSession/);
  });
});

describe('classifyOutcome', () => {
  it('recognizes success, interruption and timeouts', () => {
    expect(classifyOutcome(ok, '', 0, false, false).outcome).toBe('ok');
    expect(classifyOutcome(ok, '', null, false, true).outcome).toBe('interrupted');
    expect(classifyOutcome(null, '', null, true, false).outcome).toBe('timeout');
  });

  it('recognizes usage limits and transient API errors only when the session failed', () => {
    const limited: ResultEvent = {
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'Claude AI usage limit reached|1767225600',
    };
    expect(classifyOutcome(limited, '', 1, false, false).outcome).toBe('usage_limit');
    expect(classifyOutcome(null, 'API Error: 529 Overloaded', 1, false, false).outcome).toBe(
      'transient',
    );
    const talkative: ResultEvent = { ...ok, result: 'I checked the rate limit code path.' };
    expect(classifyOutcome(talkative, '', 0, false, false).outcome).toBe('ok');
    expect(classifyOutcome(null, 'something broke', 1, false, false).outcome).toBe('error');
  });
});

describe('parseResetTime', () => {
  const now = new Date(2026, 10, 13, 14, 0, 0);

  it('reads an epoch timestamp', () => {
    expect(parseResetTime('usage limit reached|1767225600', now)?.getTime()).toBe(
      1767225600 * 1000,
    );
  });

  it('reads a clock time and rolls over to tomorrow when it has passed', () => {
    const later = parseResetTime("You've hit your limit · resets 3pm", now);
    expect(later?.getHours()).toBe(15);
    expect(later?.getDate()).toBe(13);
    const tomorrow = parseResetTime('limit reached, resets at 9:30 am', now);
    expect([tomorrow?.getDate(), tomorrow?.getHours(), tomorrow?.getMinutes()]).toEqual([
      14, 9, 30,
    ]);
  });

  it('returns null when there is no time', () => {
    expect(parseResetTime('usage limit reached', now)).toBeNull();
  });
});

describe('buildArgs', () => {
  it('builds a headless, non-interactive invocation', () => {
    const args = buildArgs({
      name: 'flipper-s001-builder-F001',
      prompt: 'x',
      model: 'sonnet',
      effort: null,
      permissionMode: 'acceptEdits',
      timeoutMs: 1000,
      maxBudgetUsd: null,
      logPath: 'x.jsonl',
    });
    expect(args).toEqual(
      expect.arrayContaining(['-p', '--output-format', 'stream-json', '--verbose']),
    );
    expect(args.join(' ')).toContain('--permission-prompts none');
    expect(args.join(' ')).toContain('--model sonnet');
    expect(args).not.toContain('--effort');
  });

  it('refuses unusual argument values', () => {
    expect(() =>
      buildArgs({
        name: 'bad name & whoami',
        prompt: 'x',
        model: null,
        effort: null,
        permissionMode: 'acceptEdits',
        timeoutMs: 1000,
        maxBudgetUsd: null,
        logPath: 'x.jsonl',
      }),
    ).toThrow();
  });
});
