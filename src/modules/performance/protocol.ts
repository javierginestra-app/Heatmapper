/** Owned test endpoint protocol, version 1. The reference server is tools/perf-endpoint/server.js. */
export const PROTOCOL = { name: 'hm-perf', version: 1, prefix: '/hm/v1' } as const;

export interface EndpointInfo {
  readonly protocol: typeof PROTOCOL.name;
  readonly version: number;
  readonly endpointId: string;
}

export function parseEndpointInfo(value: unknown): EndpointInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.protocol !== PROTOCOL.name || v.version !== PROTOCOL.version) return null;
  if (typeof v.endpointId !== 'string' || v.endpointId.length === 0 || v.endpointId.length > 200) return null;
  return v as unknown as EndpointInfo;
}

/** Accepts http(s) base URLs only and strips a trailing slash; returns null when unusable. */
export function normalizeEndpointUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(trimmed)) return null;
  return trimmed;
}
