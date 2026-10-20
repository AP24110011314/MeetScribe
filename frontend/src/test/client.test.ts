import { isApiErrorPayload, shouldRefresh } from "../api/client";

describe("api client helpers", () => {
  it("detects error payloads with a detail field", () => {
    expect(isApiErrorPayload({ detail: "nope", code: "X" })).toBe(true);
    expect(isApiErrorPayload({ code: "X" })).toBe(false);
    expect(isApiErrorPayload(null)).toBe(false);
  });

  it("refreshes only on the first 401", () => {
    expect(shouldRefresh(401, false)).toBe(true);
    expect(shouldRefresh(401, true)).toBe(false);
    expect(shouldRefresh(500, false)).toBe(false);
  });
});
