import { type Location, type LocationKind, type Project } from './project';
import { RSSI_TARGET_RANGE_DBM } from './policies/rssiPolicy';

export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

/** Thrown by repositories when a write breaks a rule; the UI shows the same issues inline. */
export class ValidationError extends Error {
  constructor(readonly issues: readonly FieldIssue[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'ValidationError';
  }
}

export const LIMITS = { name: 120, address: 300, description: 2000 } as const;

function checkText(issues: FieldIssue[], field: string, value: string | null, max: number, required: boolean) {
  if (value === null || value.trim() === '') {
    if (required) issues.push({ field, message: 'Required' });
    return;
  }
  if (value.length > max) issues.push({ field, message: `At most ${max} characters` });
}

export function validateProject(project: Project): FieldIssue[] {
  const issues: FieldIssue[] = [];
  checkText(issues, 'name', project.name, LIMITS.name, true);
  checkText(issues, 'address', project.address, LIMITS.address, false);
  checkText(issues, 'description', project.description, LIMITS.description, false);
  const { latitude: lat, longitude: lng } = project;
  if ((lat === null) !== (lng === null)) {
    issues.push({ field: 'coordinates', message: 'Latitude and longitude must be set together' });
  } else if (lat !== null && lng !== null) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) issues.push({ field: 'coordinates', message: 'Invalid latitude' });
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) issues.push({ field: 'coordinates', message: 'Invalid longitude' });
  }
  const target = project.rssiTargetDbm;
  if (target !== null && (!Number.isInteger(target) || target < RSSI_TARGET_RANGE_DBM.min || target > RSSI_TARGET_RANGE_DBM.max)) {
    issues.push({
      field: 'rssiTargetDbm',
      message: `Whole number from ${RSSI_TARGET_RANGE_DBM.min} to ${RSSI_TARGET_RANGE_DBM.max} dBm`,
    });
  }
  return issues;
}

/** Building → Floor → Room. Levels may be skipped (a room directly in a project) but never inverted. */
const RANK: Readonly<Record<LocationKind, number>> = { building: 0, floor: 1, room: 2 };
export const LOCATION_KINDS: readonly LocationKind[] = ['building', 'floor', 'room'];

export function allowedChildKinds(parentKind: LocationKind | null): LocationKind[] {
  const parentRank = parentKind === null ? -1 : RANK[parentKind];
  return LOCATION_KINDS.filter((kind) => RANK[kind] > parentRank);
}

/**
 * Validates a location against its siblings in the same project. Kinds strictly
 * deepen down the tree, which also rules out cycles.
 */
export function validateLocation(location: Location, projectLocations: readonly Location[]): FieldIssue[] {
  const issues: FieldIssue[] = [];
  checkText(issues, 'name', location.name, LIMITS.name, true);
  let parentKind: LocationKind | null = null;
  if (location.parentId !== null) {
    const parent = projectLocations.find((l) => l.id === location.parentId);
    if (!parent) issues.push({ field: 'parentId', message: 'Parent location not found in this project' });
    else parentKind = parent.kind;
  }
  if (!allowedChildKinds(parentKind).includes(location.kind)) {
    issues.push({ field: 'kind', message: `A ${location.kind} cannot be placed inside a ${parentKind ?? 'project'}` });
  }
  const children = projectLocations.filter((l) => l.parentId === location.id);
  if (children.some((child) => !allowedChildKinds(location.kind).includes(child.kind))) {
    issues.push({ field: 'kind', message: `Existing children cannot sit inside a ${location.kind}` });
  }
  return issues;
}
