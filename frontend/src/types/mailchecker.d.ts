/**
 * mailchecker 6.x ships `types.d.ts` but no `types` field in its package.json, so TypeScript
 * never finds it. Declared here rather than patched in node_modules; only the one function we
 * use is described (see src/lib/emailPolicy.ts).
 */
declare module 'mailchecker' {
  /** false = malformed address OR a known disposable-mailbox domain. */
  export function isValid(email: string): boolean;
  export function blacklist(): Set<string>;
  export function addCustomDomains(domains: string[]): void;
}
