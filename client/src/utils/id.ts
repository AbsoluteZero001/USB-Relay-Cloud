export function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2);
  return `${timestamp}-${random}`;
}
