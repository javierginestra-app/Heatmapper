import { allowedChildKinds, breadcrumbPath, childrenOf, descendantsOf, nextSortOrder, type Location } from '@/core';
import { describeCascade } from '@/modules/projects/deletionSummary';
import { draftFromProject, draftIssues, projectFromDraft } from '@/modules/projects/projectDraft';

const loc = (id: string, kind: Location['kind'], parentId: string | null, sortOrder = 0): Location => ({
  id, projectId: 'p', parentId, kind, name: id, sortOrder, createdAtMs: 1, updatedAtMs: 1,
});
const tree = [
  loc('b', 'building', null),
  loc('f2', 'floor', 'b', 1),
  loc('f1', 'floor', 'b', 0),
  loc('r1', 'room', 'f1'),
  loc('r2', 'room', 'f1', 1),
  loc('lobby', 'room', null, 1),
];

describe('location tree', () => {
  it('orders children and computes the next slot', () => {
    expect(childrenOf(tree, 'b').map((l) => l.id)).toEqual(['f1', 'f2']);
    expect(nextSortOrder(tree, 'f1')).toBe(2);
    expect(nextSortOrder(tree, 'r1')).toBe(0);
  });

  it('builds breadcrumbs from the top down', () => {
    expect(breadcrumbPath(tree, 'r2').map((l) => l.id)).toEqual(['b', 'f1', 'r2']);
    expect(breadcrumbPath(tree, 'missing')).toEqual([]);
  });

  it('finds every descendant', () => {
    expect(descendantsOf(tree, 'b').map((l) => l.id).sort()).toEqual(['f1', 'f2', 'r1', 'r2']);
  });

  it('only allows deeper kinds below a parent', () => {
    expect(allowedChildKinds(null)).toEqual(['building', 'floor', 'room']);
    expect(allowedChildKinds('floor')).toEqual(['room']);
    expect(allowedChildKinds('room')).toEqual([]);
  });

  it('summarises what a delete also removes', () => {
    expect(describeCascade(descendantsOf(tree, 'b'), 3)).toBe('Also deletes 2 floors, 2 rooms and 3 surveys.');
    expect(describeCascade([loc('x', 'room', 'f')], 1)).toBe('Also deletes 1 room and 1 survey.');
    expect(describeCascade([], 0)).toBeNull();
  });
});

describe('project draft', () => {
  const base = { id: 'p', createdAtMs: 1 };

  it('round-trips a saved project without spurious changes', () => {
    const saved = { ...projectFromDraft({ ...draftFromProject(null), name: 'HQ', rssiTarget: '-70' }, base), updatedAtMs: 5 };
    const { updatedAtMs: _updated, ...candidate } = saved;
    expect(projectFromDraft(draftFromProject(saved), base)).toEqual(candidate);
    expect(candidate.rssiTargetDbm).toBe(-70);
  });

  it('reports a typed-but-invalid RSSI target instead of dropping it', () => {
    const draft = { ...draftFromProject(null), name: 'HQ', rssiTarget: 'abc' };
    expect(draftIssues(projectFromDraft(draft, base)).map((i) => i.field)).toEqual(['rssiTargetDbm']);
    expect(draftIssues(projectFromDraft({ ...draft, rssiTarget: ' ' }, base))).toEqual([]);
  });
});
