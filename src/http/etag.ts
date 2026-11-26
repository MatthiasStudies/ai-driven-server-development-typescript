import { createHash } from "node:crypto";

/** A strong validator for the exact JSON representation returned to the client. */
export function representationEtag(value: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("base64url");
  return `"${digest}"`;
}

// Entity tags are quoted opaque strings; commas inside quoted tags are not separators.
function parseTags(header: string): string[] | null {
  if (header.trim() === "*") return ["*"];
  const tags: string[] = [];
  let rest = header.trim();
  while (rest) {
    const match = /^(W\/)?"[\x21\x23-\x7e\x80-\xff]*"/.exec(rest);
    if (!match) return null;
    tags.push(match[0]);
    rest = rest.slice(match[0].length).trimStart();
    if (!rest) break;
    if (!rest.startsWith(",")) return null;
    rest = rest.slice(1).trimStart();
    if (!rest) return null;
  }
  return tags.length ? tags : null;
}

export function ifNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const tags = parseTags(header);
  return !!tags?.some((tag) => tag === "*" || tag.replace(/^W\//, "") === etag);
}

export function ifMatch(header: string, etag: string): boolean {
  const tags = parseTags(header);
  return !!tags?.some((tag) => tag === "*" || tag === etag);
}
