/**
 * Server actions return a Failure instead of throwing: production builds replace a thrown error's message with a
 * generic one before it reaches the browser, which would hide "That email is already linked" and the like.
 */
export type Failure = { __error: string };

export const failed = (r: unknown): r is Failure => !!r && typeof r === "object" && "__error" in r;

/** Rethrows a Failure here in the browser, so an existing try/catch shows the real message. */
export function ok<T>(r: T | Failure): T {
  if (failed(r)) throw new Error(r.__error);
  return r;
}

/** For fire-and-forget calls: tell the person instead of failing silently. */
export async function orAlert<T>(p: Promise<T | Failure>): Promise<T | Failure> {
  const r = await p;
  if (failed(r)) alert(r.__error);
  return r;
}
