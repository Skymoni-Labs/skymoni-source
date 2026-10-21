export function refreshRetryDelay(value: unknown, now = Date.now()) {
  if (typeof value !== 'string' && typeof value !== 'number') return 60_000
  const seconds = Number(value)
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(String(value)) - now
  return Number.isFinite(delay)
    ? Math.max(1000, Math.min(delay, 20 * 60_000))
    : 60_000
}
