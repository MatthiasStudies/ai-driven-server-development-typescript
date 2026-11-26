import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ifNoneMatch, representationEtag } from "./etag.js";
import { badRequest, ProblemError, unauthorized } from "./problem.js";
import { idSchema, validate } from "./validate.js";

export type AuthenticatedEnv = { Variables: { subject: string } };
export type ResourceContext = Context<AuthenticatedEnv>;

export function subject(c: ResourceContext): string {
  const value = c.get("subject");
  if (typeof value !== "string" || !value) throw unauthorized();
  return value;
}

export function pathId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw badRequest("Invalid resource id");
  return validate(idSchema, value);
}

export function noQuery(c: ResourceContext): void {
  if (new URL(c.req.url).searchParams.size) throw badRequest("Unexpected query parameter");
}

export function requireIfMatch(c: ResourceContext): string {
  const value = c.req.header("If-Match");
  if (!value) throw new ProblemError(428, "Precondition Required", "If-Match is required");
  return value;
}

export function jsonResource(c: ResourceContext, value: unknown, status: ContentfulStatusCode = 200, conditional = false): Response {
  const etag = representationEtag(value);
  c.header("ETag", etag);
  if (conditional && ifNoneMatch(c.req.header("If-None-Match"), etag)) return c.body(null, 304);
  return c.json(value, status);
}
