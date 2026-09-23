import { validateProject, type FieldIssue, type Project } from '@/core';

/** Form state. Text stays as typed; conversion happens in `projectFromDraft`. */
export interface ProjectDraft {
  readonly name: string;
  readonly address: string;
  readonly description: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly rssiTarget: string;
}

export type ProjectCandidate = Omit<Project, 'updatedAtMs'>;

export function draftFromProject(project: Project | null): ProjectDraft {
  return {
    name: project?.name ?? '',
    address: project?.address ?? '',
    description: project?.description ?? '',
    latitude: project?.latitude ?? null,
    longitude: project?.longitude ?? null,
    rssiTarget: project?.rssiTargetDbm == null ? '' : String(project.rssiTargetDbm),
  };
}

const blankToNull = (text: string) => (text.trim() === '' ? null : text.trim());

export function projectFromDraft(draft: ProjectDraft, base: { id: string; createdAtMs: number }): ProjectCandidate {
  const target = draft.rssiTarget.trim();
  return {
    id: base.id,
    createdAtMs: base.createdAtMs,
    name: draft.name.trim(),
    address: blankToNull(draft.address),
    description: blankToNull(draft.description),
    latitude: draft.latitude,
    longitude: draft.longitude,
    // An unparseable entry becomes NaN so validation reports it instead of silently dropping it.
    rssiTargetDbm: target === '' ? null : Number(target),
  };
}

export function draftIssues(candidate: ProjectCandidate): FieldIssue[] {
  return validateProject({ ...candidate, updatedAtMs: candidate.createdAtMs });
}
