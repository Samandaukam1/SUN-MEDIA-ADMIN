/**
 * Who may open Smm Api: NEOSMM_OWNER_USER_ID holds one or more explicit account ids (comma / space separated), each
 * a verified owner account — never a role, never "the first user". Anything that is not a UUID is ignored, so a typo
 * locks the module rather than opening it. Pure (unit-tested).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseOwnerIds(value: string | null | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(/[\s,;]+/)
        .map((v) => v.trim().toLowerCase())
        .filter((v) => UUID.test(v)),
    ),
  ].slice(0, 10);
}
