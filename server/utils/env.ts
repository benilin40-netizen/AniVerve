export function cleanEnv(raw: string | undefined, fallback = ''): string {
  if (!raw) return fallback;
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val || fallback;
}
