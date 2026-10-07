/** Small string helpers with a security angle. */
/**
 * Makes user input safe to embed in a `RegExp`.
 *
 * Search boxes become case-insensitive regex filters. Without escaping, a
 * search for "a+" or "(" is either a crash or an attacker-controlled pattern —
 * and a pattern like "(a+)+$" can pin a CPU for seconds (ReDoS).
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
