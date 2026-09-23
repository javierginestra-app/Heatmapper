import { type Location } from './project';

const bySortOrder = (a: Location, b: Location) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs;

export function childrenOf(locations: readonly Location[], parentId: string | null): Location[] {
  return locations.filter((l) => l.parentId === parentId).sort(bySortOrder);
}

/** Ancestors from the top of the project down to (and including) the location. */
export function breadcrumbPath(locations: readonly Location[], locationId: string): Location[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const path: Location[] = [];
  let current = byId.get(locationId);
  while (current && path.length <= locations.length) {
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}

/** Every location nested below `locationId` (not including it). */
export function descendantsOf(locations: readonly Location[], locationId: string): Location[] {
  const result: Location[] = [];
  const queue = [locationId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of locations.filter((l) => l.parentId === id)) {
      result.push(child);
      queue.push(child.id);
    }
  }
  return result;
}

export function nextSortOrder(locations: readonly Location[], parentId: string | null): number {
  const siblings = locations.filter((l) => l.parentId === parentId);
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((l) => l.sortOrder)) + 1;
}
