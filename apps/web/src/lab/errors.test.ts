import { describe, expect, it } from "vitest";
import { serviceError } from "./errors";

describe("serviceError", () => {
  it("treats a failed fetch or timeout as offline", () => {
    expect(serviceError(new TypeError("Failed to fetch")).kind).toBe("offline");
    expect(serviceError(new DOMException("t", "TimeoutError")).kind).toBe("offline");
  });
  it("unwraps FastAPI's JSON detail on a 422", () => {
    const e = new Error(`/calibrate/audio answered 422: ${JSON.stringify({ detail: 'Calibration didn\'t work: "ee" and "oo" sounded too alike' })}`);
    expect(serviceError(e)).toEqual({ kind: "rejected", detail: 'Calibration didn\'t work: "ee" and "oo" sounded too alike' });
  });
  it("joins validation errors and hides 5xx internals", () => {
    expect(serviceError(new Error(`/analyze answered 422: ${JSON.stringify({ detail: [{ msg: "bad promptId" }] })}`)).detail).toBe("bad promptId");
    expect(serviceError(new Error("/analyze answered 500: Traceback…")).kind).toBe("failed");
  });
});
