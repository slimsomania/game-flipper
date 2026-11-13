import { describe, expect, it } from 'vitest';
import {
  counts,
  guardFeatureList,
  milestoneProgress,
  pickNext,
  serializeFeatureList,
  validateFeatureList,
  type Feature,
  type FeatureList,
} from '../../harness/lib/features';

function feature(id: string, overrides: Partial<Feature> = {}): Feature {
  return {
    id,
    milestone: 'M1',
    category: 'gameplay',
    title: `Feature ${id}`,
    description: 'Does a thing.',
    acceptance: ['It works'],
    depends_on: [],
    status: 'todo',
    attempts: 0,
    notes: '',
    review_feedback: '',
    ...overrides,
  };
}

function list(...features: Feature[]): FeatureList {
  return {
    project: 'Flipper',
    milestones: [
      { id: 'M1', title: 'First playable', goal: 'Play it' },
      { id: 'M2', title: 'Depth', goal: 'More' },
    ],
    features,
  };
}

const text = (l: FeatureList): string => serializeFeatureList(l);

describe('validateFeatureList', () => {
  it('accepts a valid list and fills in optional fields', () => {
    const result = validateFeatureList({
      milestones: [{ id: 'M1', title: 'First' }],
      features: [
        {
          id: 'F001',
          milestone: 'M1',
          category: 'core',
          title: 'T',
          description: 'D',
          acceptance: ['a'],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.list.features[0]).toMatchObject({
        status: 'todo',
        attempts: 0,
        depends_on: [],
        notes: '',
      });
    }
  });

  it('rejects duplicate ids, unknown milestones, missing criteria and forward dependencies', () => {
    const result = validateFeatureList({
      milestones: [{ id: 'M1', title: 'First' }],
      features: [
        {
          id: 'F001',
          milestone: 'M1',
          category: 'c',
          title: 't',
          description: 'd',
          acceptance: ['a'],
          depends_on: ['F002'],
        },
        {
          id: 'F002',
          milestone: 'M9',
          category: 'c',
          title: 't',
          description: 'd',
          acceptance: [],
        },
        {
          id: 'F002',
          milestone: 'M1',
          category: 'c',
          title: 't',
          description: 'd',
          acceptance: ['a'],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const all = result.errors.join('\n');
      expect(all).toContain('depends on "F002", which must come earlier');
      expect(all).toContain('milestone "M9" is not listed');
      expect(all).toContain('"acceptance" must be a non-empty list');
      expect(all).toContain('the id is used twice');
    }
  });

  it('rejects unknown statuses', () => {
    const result = validateFeatureList(list(feature('F001', { status: 'almost' as never })));
    expect(result.ok).toBe(false);
  });
});

describe('pickNext', () => {
  it('plans when there are no features', () => {
    expect(pickNext(list(), { maintenanceDue: false })).toEqual({ kind: 'plan', mode: 'initial' });
  });

  it('reviews before building anything else', () => {
    const l = list(feature('F001', { status: 'needs_review' }), feature('F002'));
    expect(pickNext(l, { maintenanceDue: true })).toMatchObject({
      kind: 'review',
      feature: { id: 'F001' },
    });
  });

  it('builds the first todo feature whose dependencies are done', () => {
    const l = list(
      feature('F001', { status: 'blocked' }),
      feature('F002', { depends_on: ['F001'] }),
      feature('F003'),
    );
    expect(pickNext(l, { maintenanceDue: false })).toMatchObject({
      kind: 'build',
      feature: { id: 'F003' },
    });
  });

  it('runs maintenance when due and nothing waits for review', () => {
    expect(pickNext(list(feature('F001')), { maintenanceDue: true })).toEqual({ kind: 'maintain' });
  });

  it('reports completion and being stuck', () => {
    expect(pickNext(list(feature('F001', { status: 'done' })), { maintenanceDue: true }).kind).toBe(
      'complete',
    );
    const stuck = pickNext(
      list(feature('F001', { status: 'blocked' }), feature('F002', { depends_on: ['F001'] })),
      {
        maintenanceDue: false,
      },
    );
    expect(stuck.kind).toBe('stuck');
  });

  it('honours a forced feature', () => {
    const l = list(feature('F001'), feature('F002'));
    expect(pickNext(l, { maintenanceDue: false, forceFeature: 'F002' })).toMatchObject({
      kind: 'build',
      feature: { id: 'F002' },
    });
  });
});

describe('guardFeatureList', () => {
  const pre = list(feature('F001', { status: 'done' }), feature('F002'), feature('F003'));

  it('lets a builder move its own feature to needs_review and update notes', () => {
    const post = structuredClone(pre);
    post.features[1].status = 'needs_review';
    post.features[1].notes = 'Built it.';
    const { list: result, violations } = guardFeatureList({
      role: 'builder',
      pre,
      postText: text(post),
      featureId: 'F002',
      review: true,
    });
    expect(violations).toEqual([]);
    expect(result.features[1]).toMatchObject({ status: 'needs_review', notes: 'Built it.' });
  });

  it('turns a builder "done" into needs_review when reviews are on, and keeps done when they are off', () => {
    const post = structuredClone(pre);
    post.features[1].status = 'done';
    const withReview = guardFeatureList({
      role: 'builder',
      pre,
      postText: text(post),
      featureId: 'F002',
      review: true,
    });
    expect(withReview.list.features[1].status).toBe('needs_review');
    expect(withReview.violations).toHaveLength(1);
    const withoutReview = guardFeatureList({
      role: 'builder',
      pre,
      postText: text(post),
      featureId: 'F002',
      review: false,
    });
    expect(withoutReview.list.features[1].status).toBe('done');
    expect(withoutReview.violations).toEqual([]);
  });

  it('reverts changes to other features, to definitions, to attempts, and additions', () => {
    const post = structuredClone(pre);
    post.features[0].status = 'todo';
    post.features[1].acceptance = ['Something easier'];
    post.features[1].attempts = 0;
    post.features[2].notes = 'meddling';
    post.features.push(feature('F004'));
    const { list: result, violations } = guardFeatureList({
      role: 'builder',
      pre,
      postText: text(post),
      featureId: 'F002',
      review: true,
    });
    expect(result.features).toHaveLength(3);
    expect(result.features[0].status).toBe('done');
    expect(result.features[1].acceptance).toEqual(['It works']);
    expect(result.features[2].notes).toBe('');
    expect(violations.length).toBeGreaterThanOrEqual(3);
  });

  it('restores the previous list when the file was broken or deleted', () => {
    expect(
      guardFeatureList({
        role: 'builder',
        pre,
        postText: '{ nope',
        featureId: 'F002',
        review: true,
      }).list,
    ).toEqual(pre);
    expect(
      guardFeatureList({ role: 'builder', pre, postText: null, featureId: 'F002', review: true })
        .list,
    ).toEqual(pre);
  });

  it('lets a reviewer pass or fail its feature, and supplies feedback when it is missing', () => {
    const inReview = list(feature('F001', { status: 'needs_review' }));
    const pass = structuredClone(inReview);
    pass.features[0].status = 'done';
    expect(
      guardFeatureList({
        role: 'reviewer',
        pre: inReview,
        postText: text(pass),
        featureId: 'F001',
        review: true,
      }).list.features[0].status,
    ).toBe('done');

    const fail = structuredClone(inReview);
    fail.features[0].status = 'todo';
    const result = guardFeatureList({
      role: 'reviewer',
      pre: inReview,
      postText: text(fail),
      featureId: 'F001',
      review: true,
    });
    expect(result.list.features[0].status).toBe('todo');
    expect(result.list.features[0].review_feedback).not.toBe('');
  });

  it('allows a maintainer no changes at all', () => {
    const post = structuredClone(pre);
    post.features[1].status = 'done';
    const { list: result, violations } = guardFeatureList({
      role: 'maintainer',
      pre,
      postText: text(post),
      review: true,
    });
    expect(result).toEqual(pre);
    expect(violations).toHaveLength(1);
  });

  it('accepts an initial plan with every feature reset to todo', () => {
    const post = list(feature('F001', { status: 'done', attempts: 2 }), feature('F002'));
    const { list: result, violations } = guardFeatureList({
      role: 'planner',
      pre: list(),
      postText: text(post),
      review: true,
    });
    expect(violations).toEqual([]);
    expect(result.features.map((f) => [f.status, f.attempts])).toEqual([
      ['todo', 0],
      ['todo', 0],
    ]);
  });

  it('extends a plan by appending, keeping existing features unchanged', () => {
    const post = structuredClone(pre);
    post.features[0].title = 'Renamed';
    post.features.splice(2, 1);
    post.features.push(feature('F004', { milestone: 'M2', depends_on: ['F001'] }));
    const { list: result, violations } = guardFeatureList({
      role: 'planner',
      pre,
      postText: text(post),
      review: true,
    });
    expect(result.features.map((f) => f.id)).toEqual(['F001', 'F002', 'F003', 'F004']);
    expect(result.features[0].title).toBe('Feature F001');
    expect(violations).toHaveLength(2);
  });
});

describe('progress helpers', () => {
  it('counts statuses and milestone progress', () => {
    const l = list(
      feature('F001', { status: 'done' }),
      feature('F002', { status: 'blocked' }),
      feature('F003', { milestone: 'M2', status: 'done' }),
    );
    expect(counts(l)).toEqual({ total: 3, todo: 0, needs_review: 0, done: 2, blocked: 1 });
    expect(milestoneProgress(l).map((m) => [m.id, m.done, m.total, m.complete])).toEqual([
      ['M1', 1, 2, false],
      ['M2', 1, 1, true],
    ]);
  });
});
