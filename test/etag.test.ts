import { describe, expect, it } from "vitest";
import { ifMatch, ifNoneMatch, representationEtag } from "../src/http/etag.js";

describe("representation validators", () => {
  it("produces stable strong tags which change with the representation", () => {
    const tag = representationEtag({ id: 1, version: 1, certificate: null });
    expect(tag).toMatch(/^"[A-Za-z0-9_-]+"$/);
    expect(representationEtag({ id: 1, version: 1, certificate: null })).toBe(tag);
    expect(representationEtag({ id: 1, version: 2, certificate: null })).not.toBe(tag);
    expect(representationEtag({ id: 1, version: 1, certificate: { id: 1 } })).not.toBe(tag);
  });

  it("uses weak comparison for If-None-Match, and strong comparison for If-Match", () => {
    const tag = representationEtag({ id: 1 });
    expect(ifNoneMatch(`"other", W/${tag}`, tag)).toBe(true);
    expect(ifNoneMatch("*", tag)).toBe(true);
    expect(ifNoneMatch('"other"', tag)).toBe(false);
    expect(ifMatch(`"other", ${tag}`, tag)).toBe(true);
    expect(ifMatch(`W/${tag}`, tag)).toBe(false);
    expect(ifMatch('"unterminated', tag)).toBe(false);
  });
});
