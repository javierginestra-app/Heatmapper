export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Mean absolute difference between consecutive round trips (RFC 3550 style, without smoothing). */
export function jitter(rtts: readonly number[]): number | null {
  if (rtts.length < 2) return null;
  let total = 0;
  for (let i = 1; i < rtts.length; i++) total += Math.abs(rtts[i]! - rtts[i - 1]!);
  return total / (rtts.length - 1);
}

/** Megabits per second from bytes and milliseconds; null when the timing is unusable. */
export function mbps(bytes: number, elapsedMs: number): number | null {
  if (bytes <= 0 || !(elapsedMs > 0)) return null;
  return (bytes * 8) / elapsedMs / 1000;
}

export const round = (value: number | null, digits: number) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
