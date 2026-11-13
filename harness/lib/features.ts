/*
 * The feature list (harness/state/feature_list.json): validation, choosing the next action,
 * and the guard that decides which changes a session was allowed to make.
 * Pure functions only, so they can be unit-tested (tests/harness/features.test.ts).
 */
import type { Role } from './config';

export const STATUSES = ['todo', 'needs_review', 'done', 'blocked'] as const;
export type FeatureStatus = (typeof STATUSES)[number];

export interface Milestone {
  id: string;
  title: string;
  goal: string;
}

export interface Feature {
  id: string;
  milestone: string;
  category: string;
  title: string;
  description: string;
  acceptance: string[];
  depends_on: string[];
  status: FeatureStatus;
  attempts: number;
  notes: string;
  review_feedback: string;
}

export interface FeatureList {
  project: string;
  milestones: Milestone[];
  features: Feature[];
}

export type Validation = { ok: true; list: FeatureList } | { ok: false; errors: string[] };

export function emptyFeatureList(): FeatureList {
  return { project: 'Flipper', milestones: [], features: [] };
}

export function serializeFeatureList(list: FeatureList): string {
  return `${JSON.stringify(list, null, 2)}\n`;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const nonEmpty = (v: unknown): v is string => isString(v) && v.trim().length > 0;

export function parseFeatureList(text: string): Validation {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`not valid JSON: ${(err as Error).message}`] };
  }
  return validateFeatureList(data);
}

/** Checks structure and invariants, and fills in optional fields with their defaults. */
export function validateFeatureList(data: unknown): Validation {
  if (!isObject(data)) return { ok: false, errors: ['the top level must be a JSON object'] };
  const errors: string[] = [];
  if (!Array.isArray(data.milestones)) errors.push('"milestones" must be an array');
  if (!Array.isArray(data.features)) errors.push('"features" must be an array');
  if (errors.length) return { ok: false, errors };

  const milestones: Milestone[] = [];
  const milestoneIds = new Set<string>();
  (data.milestones as unknown[]).forEach((m, i) => {
    const where = `milestones[${i}]`;
    if (!isObject(m)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (!isString(m.id) || !/^M\d+$/.test(m.id)) errors.push(`${where}.id must look like "M1"`);
    else if (milestoneIds.has(m.id)) errors.push(`${where}.id "${m.id}" is used twice`);
    else milestoneIds.add(m.id);
    if (!nonEmpty(m.title)) errors.push(`${where}.title is required`);
    milestones.push({
      id: String(m.id),
      title: isString(m.title) ? m.title : '',
      goal: isString(m.goal) ? m.goal : '',
    });
  });

  const features: Feature[] = [];
  const seen = new Set<string>();
  (data.features as unknown[]).forEach((f, i) => {
    if (!isObject(f)) {
      errors.push(`features[${i}] must be an object`);
      return;
    }
    const where = isString(f.id) ? `feature ${f.id}` : `features[${i}]`;
    if (!isString(f.id) || !/^F\d{3,}$/.test(f.id))
      errors.push(`${where}: id must look like "F001"`);
    else if (seen.has(f.id)) errors.push(`${where}: the id is used twice`);
    if (!isString(f.milestone) || !milestoneIds.has(f.milestone)) {
      errors.push(`${where}: milestone "${String(f.milestone)}" is not listed in "milestones"`);
    }
    for (const key of ['category', 'title', 'description'] as const) {
      if (!nonEmpty(f[key])) errors.push(`${where}: "${key}" is required`);
    }
    if (
      !isStringArray(f.acceptance) ||
      f.acceptance.length === 0 ||
      !f.acceptance.every(nonEmpty)
    ) {
      errors.push(`${where}: "acceptance" must be a non-empty list of criteria`);
    }
    const deps = f.depends_on ?? [];
    if (!isStringArray(deps)) {
      errors.push(`${where}: "depends_on" must be a list of feature ids`);
    } else {
      for (const dep of deps) {
        if (dep === f.id) errors.push(`${where}: depends on itself`);
        else if (!seen.has(dep))
          errors.push(`${where}: depends on "${dep}", which must come earlier`);
      }
    }
    const status = f.status ?? 'todo';
    if (!isString(status) || !(STATUSES as readonly string[]).includes(status)) {
      errors.push(`${where}: status must be one of ${STATUSES.join(', ')}`);
    }
    const attempts = f.attempts ?? 0;
    if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0) {
      errors.push(`${where}: "attempts" must be a whole number >= 0`);
    }
    for (const key of ['notes', 'review_feedback'] as const) {
      if (f[key] !== undefined && !isString(f[key])) errors.push(`${where}: "${key}" must be text`);
    }
    if (isString(f.id)) seen.add(f.id);
    features.push({
      id: String(f.id),
      milestone: String(f.milestone),
      category: isString(f.category) ? f.category : '',
      title: isString(f.title) ? f.title : '',
      description: isString(f.description) ? f.description : '',
      acceptance: isStringArray(f.acceptance) ? [...f.acceptance] : [],
      depends_on: isStringArray(deps) ? [...deps] : [],
      status: status as FeatureStatus,
      attempts: typeof attempts === 'number' ? attempts : 0,
      notes: isString(f.notes) ? f.notes : '',
      review_feedback: isString(f.review_feedback) ? f.review_feedback : '',
    });
  });

  if (errors.length) return { ok: false, errors };
  const project = isString(data.project) ? data.project : 'Flipper';
  return { ok: true, list: { project, milestones, features } };
}

export interface Counts {
  total: number;
  todo: number;
  needs_review: number;
  done: number;
  blocked: number;
}

export function counts(list: FeatureList): Counts {
  const c: Counts = { total: list.features.length, todo: 0, needs_review: 0, done: 0, blocked: 0 };
  for (const f of list.features) c[f.status]++;
  return c;
}

export interface MilestoneProgress {
  id: string;
  title: string;
  done: number;
  total: number;
  complete: boolean;
}

export function milestoneProgress(list: FeatureList): MilestoneProgress[] {
  return list.milestones.map((m) => {
    const features = list.features.filter((f) => f.milestone === m.id);
    const done = features.filter((f) => f.status === 'done').length;
    return {
      id: m.id,
      title: m.title,
      done,
      total: features.length,
      complete: features.length > 0 && done === features.length,
    };
  });
}

export type NextAction =
  | { kind: 'plan'; mode: 'initial' | 'extend' }
  | { kind: 'review'; feature: Feature }
  | { kind: 'build'; feature: Feature }
  | { kind: 'maintain' }
  | { kind: 'complete' }
  | { kind: 'stuck'; reason: string };

export interface PickOptions {
  maintenanceDue: boolean;
  /** Build (or review) this feature next, if possible. */
  forceFeature?: string | null;
}

/** Decide what the next session should do. Reviews come first so work never piles up unchecked. */
export function pickNext(list: FeatureList, opts: PickOptions): NextAction {
  if (list.features.length === 0) return { kind: 'plan', mode: 'initial' };
  const byId = new Map(list.features.map((f) => [f.id, f]));

  if (opts.forceFeature) {
    const f = byId.get(opts.forceFeature);
    if (!f) return { kind: 'stuck', reason: `feature ${opts.forceFeature} does not exist` };
    if (f.status === 'done') return { kind: 'stuck', reason: `feature ${f.id} is already done` };
    if (f.status === 'needs_review') return { kind: 'review', feature: f };
    return { kind: 'build', feature: f };
  }

  const toReview = list.features.find((f) => f.status === 'needs_review');
  if (toReview) return { kind: 'review', feature: toReview };
  if (list.features.every((f) => f.status === 'done')) return { kind: 'complete' };
  if (opts.maintenanceDue) return { kind: 'maintain' };

  const ready = list.features.find(
    (f) => f.status === 'todo' && f.depends_on.every((d) => byId.get(d)?.status === 'done'),
  );
  if (ready) return { kind: 'build', feature: ready };

  const blocked = list.features.filter((f) => f.status === 'blocked').map((f) => f.id);
  const waiting = list.features.filter((f) => f.status === 'todo').length;
  let reason = 'no todo feature has all of its dependencies done';
  if (blocked.length && waiting) {
    reason = `${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} blocked, and the ${waiting} remaining todo feature(s) depend on ${blocked.length === 1 ? 'it' : 'them'}`;
  } else if (blocked.length) {
    reason = `the only unfinished features are blocked: ${blocked.join(', ')}`;
  }
  return { kind: 'stuck', reason };
}

export interface GuardInput {
  role: Role;
  /** The list as it was before the session (from git). */
  pre: FeatureList;
  /** The file's text after the session, or null if it was deleted. */
  postText: string | null;
  /** The feature the session was assigned (builder / reviewer). */
  featureId?: string | null;
  /** Whether reviewer sessions are in use. */
  review: boolean;
}

export interface GuardResult {
  /** The list with only the changes this role is allowed to make. */
  list: FeatureList;
  /** Human-readable descriptions of what was disallowed (reverted or adjusted). */
  violations: string[];
}

/** Fields that define a feature; only the planner sets them. */
const DEFINITION_FIELDS = [
  'id',
  'milestone',
  'category',
  'title',
  'description',
  'acceptance',
  'depends_on',
] as const;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Compare the list before and after a session and keep only the changes the role may make:
 *   planner    - writes the plan (initial) or appends features (extend); never edits existing ones
 *   builder    - its own feature's status (todo / needs_review / blocked) and notes
 *   reviewer   - its own feature's status (done / todo), notes and review_feedback
 *   maintainer - nothing
 * `attempts` is always maintained by the harness.
 */
export function guardFeatureList(input: GuardInput): GuardResult {
  const { role, pre } = input;
  const violations: string[] = [];
  if (input.postText === null) {
    return { list: structuredClone(pre), violations: ['feature_list.json was deleted (restored)'] };
  }
  const parsed = parseFeatureList(input.postText);
  if (!parsed.ok) {
    violations.push(`feature_list.json was left invalid (${parsed.errors.slice(0, 3).join('; ')})`);
    return { list: structuredClone(pre), violations };
  }
  const post = parsed.list;
  if (role === 'planner') return guardPlanner(pre, post, violations);

  const result = structuredClone(pre);
  const postById = new Map(post.features.map((f) => [f.id, f]));
  const assigned = role === 'maintainer' ? null : (input.featureId ?? null);

  if (!same(pre.milestones, post.milestones)) violations.push('milestones were changed (reverted)');
  for (const f of pre.features) {
    const p = postById.get(f.id);
    if (!p) {
      violations.push(`${f.id} was removed (restored)`);
      continue;
    }
    if (f.id !== assigned) {
      if (!same(f, p))
        violations.push(
          `${f.id} was changed, but this session may only change ${assigned ?? 'nothing'} (reverted)`,
        );
      continue;
    }
    for (const key of DEFINITION_FIELDS) {
      if (!same(f[key], p[key]))
        violations.push(`${f.id}.${key} may only be changed by the planner (reverted)`);
    }
    if (f.attempts !== p.attempts)
      violations.push(`${f.id}.attempts is counted by the harness (reverted)`);
  }
  for (const p of post.features) {
    if (!pre.features.some((f) => f.id === p.id))
      violations.push(`${p.id} was added outside a planner session (removed)`);
  }

  const target = assigned ? result.features.find((f) => f.id === assigned) : undefined;
  const changed = assigned ? postById.get(assigned) : undefined;
  if (target && changed) {
    target.notes = changed.notes;
    if (role === 'builder') applyBuilderStatus(target, changed.status, input.review, violations);
    if (role === 'reviewer') {
      if (changed.status === 'done' || changed.status === 'todo') target.status = changed.status;
      else if (changed.status !== target.status) {
        violations.push(
          `${target.id}: a reviewer may only set "done" or "todo" (kept "${target.status}")`,
        );
      }
      target.review_feedback = changed.review_feedback;
      if (target.status === 'todo' && !target.review_feedback.trim()) {
        target.review_feedback =
          'The reviewer rejected this feature without feedback. Re-check every acceptance criterion.';
      }
    }
  }
  return { list: result, violations };
}

function applyBuilderStatus(
  target: Feature,
  requested: FeatureStatus,
  review: boolean,
  violations: string[],
): void {
  let status = requested;
  if (review && status === 'done') {
    violations.push(
      `${target.id}: builders can't mark a feature done; set to needs_review for the reviewer`,
    );
    status = 'needs_review';
  }
  if (!review && status === 'needs_review') status = 'done';
  const allowed: FeatureStatus[] = ['todo', 'blocked', review ? 'needs_review' : 'done'];
  if (allowed.includes(status)) target.status = status;
  else violations.push(`${target.id}: a builder may not set status "${requested}"`);
}

function guardPlanner(pre: FeatureList, post: FeatureList, violations: string[]): GuardResult {
  if (pre.features.length === 0) {
    // Initial plan: accept it, but every feature starts fresh.
    const list = structuredClone(post);
    for (const f of list.features) {
      f.status = 'todo';
      f.attempts = 0;
      f.review_feedback = '';
    }
    if (list.features.length === 0) violations.push('the planner produced no features');
    return { list, violations };
  }

  // Extending: existing milestones and features stay as they were (notes may change);
  // new milestones and features are appended.
  const list = structuredClone(pre);
  const postById = new Map(post.features.map((f) => [f.id, f]));
  for (const f of list.features) {
    const p = postById.get(f.id);
    if (!p) violations.push(`${f.id} was removed (restored)`);
    else if (!same({ ...f, notes: '' }, { ...p, notes: '' }))
      violations.push(`${f.id} was modified (kept the original)`);
    else f.notes = p.notes;
  }
  for (const m of pre.milestones) {
    const pm = post.milestones.find((x) => x.id === m.id);
    if (!pm || !same(m, pm))
      violations.push(`milestone ${m.id} was changed or removed (kept the original)`);
  }
  const knownMilestones = new Set(pre.milestones.map((m) => m.id));
  for (const m of post.milestones) {
    if (!knownMilestones.has(m.id)) list.milestones.push(structuredClone(m));
  }
  const knownFeatures = new Set(pre.features.map((f) => f.id));
  for (const p of post.features) {
    if (!knownFeatures.has(p.id)) {
      list.features.push({
        ...structuredClone(p),
        status: 'todo',
        attempts: 0,
        review_feedback: '',
      });
    }
  }
  const check = validateFeatureList(list);
  if (!check.ok) {
    violations.push(
      `the extended plan is invalid (${check.errors.slice(0, 3).join('; ')}); kept the previous plan`,
    );
    return { list: structuredClone(pre), violations };
  }
  if (check.list.features.length === pre.features.length)
    violations.push('the planner added no features');
  return { list: check.list, violations };
}
