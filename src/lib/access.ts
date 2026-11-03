import { timingSafeEqual } from "node:crypto";

type HeaderReader = { get(name: string): string | null };
export function isLocalDemo(headers: HeaderReader): boolean {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.LOCAL_DEMO_ENABLED !== "true"
  )
    return false;
  const expected = process.env.LOCAL_GATE_TOKEN;
  const actual = headers.get("x-local-demo-gate");
  if (!expected || expected.length < 64 || !actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
