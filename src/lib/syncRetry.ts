/** A 4xx other than "slow down" or "try again" means the server is refusing this answer for good. */
export function isFinalFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** How long to wait after the nth failed send in a row: 6s, 12s, 24s, 48s, then 60s. */
export function backoffDelayMs(failures: number): number {
  return Math.min(60000, 6000 * 2 ** failures);
}
