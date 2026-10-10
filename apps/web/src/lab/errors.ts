// Turns a failed call to the audio service (api/audio.ts) into something a person can act on.
export type ServiceError = { kind: "offline" | "rejected" | "failed"; detail: string };

export function serviceError(e: unknown): ServiceError {
  // fetch() rejects with a TypeError when nothing answers; AbortSignal.timeout gives a TimeoutError.
  if (e instanceof TypeError || (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError"))) {
    return { kind: "offline", detail: "Can't reach the analyzer. Check it's running, then try again." };
  }
  const msg = e instanceof Error ? e.message : String(e);
  const m = /answered (\d{3}): ([\s\S]*)$/.exec(msg);
  if (!m) return { kind: "failed", detail: "Something went wrong. Try again." };
  let detail = m[2];
  try {
    const body = JSON.parse(m[2]);
    detail = typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? body.detail.map((d: { msg?: string }) => d.msg).join("; ") : m[2];
  } catch { /* plain-text body */ }
  return Number(m[1]) < 500 ? { kind: "rejected", detail } : { kind: "failed", detail: "The analyzer hit an error. Try again." };
}
