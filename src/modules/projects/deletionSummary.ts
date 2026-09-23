import { type Location, type LocationKind } from '@/core';

const PLURAL: Readonly<Record<LocationKind, [string, string]>> = {
  building: ['building', 'buildings'],
  floor: ['floor', 'floors'],
  room: ['room', 'rooms'],
};

function count(n: number, [one, many]: [string, string]): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Also deletes 2 floors, 5 rooms and 3 surveys." or null when nothing else is lost. */
export function describeCascade(descendants: readonly Location[], surveyCount: number): string | null {
  const parts: string[] = [];
  for (const kind of ['building', 'floor', 'room'] as const) {
    const n = descendants.filter((l) => l.kind === kind).length;
    if (n > 0) parts.push(count(n, PLURAL[kind]));
  }
  if (surveyCount > 0) parts.push(count(surveyCount, ['survey', 'surveys']));
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Also deletes ${list}.`;
}

export const KIND_LABEL: Readonly<Record<LocationKind, string>> = { building: 'Building', floor: 'Floor', room: 'Room' };
