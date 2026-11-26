import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const PROBLEM_BASE = "https://tcg-card-stack.local/problems";

export interface ProblemErrorDetail {
  path: string;
  message: string;
}

export class ProblemError extends Error {
  readonly status: ContentfulStatusCode;
  readonly title: string;
  readonly type: string;
  readonly errors?: ProblemErrorDetail[];

  constructor(
    status: ContentfulStatusCode,
    title: string,
    detail?: string,
    errors?: ProblemErrorDetail[],
  ) {
    super(detail ?? title);
    this.name = "ProblemError";
    this.status = status;
    this.title = title;
    this.type = `${PROBLEM_BASE}/${title.toLowerCase().replaceAll(/\s+/g, "-")}`;
    this.errors = errors;
  }
}

export function problemResponse(
  c: Context,
  status: ContentfulStatusCode,
  title: string,
  detail?: string,
  errors?: ProblemErrorDetail[],
): Response {
  const type = `${PROBLEM_BASE}/${title.toLowerCase().replaceAll(/\s+/g, "-")}`;
  const body = {
    type,
    title,
    status,
    ...(detail ? { detail } : {}),
    instance: new URL(c.req.url).pathname,
    ...(errors?.length ? { errors } : {}),
  };
  return c.newResponse(JSON.stringify(body), status, {
    "content-type": "application/problem+json",
  });
}

export function problemFromError(c: Context, error: ProblemError): Response {
  const body = {
    type: error.type,
    title: error.title,
    status: error.status,
    ...(error.message !== error.title ? { detail: error.message } : {}),
    instance: new URL(c.req.url).pathname,
    ...(error.errors?.length ? { errors: error.errors } : {}),
  };
  return c.newResponse(JSON.stringify(body), error.status, {
    "content-type": "application/problem+json",
  });
}

export const badRequest = (detail?: string, errors?: ProblemErrorDetail[]) =>
  new ProblemError(400, "Bad Request", detail, errors);
export const unauthorized = (detail = "Authentication is required") =>
  new ProblemError(401, "Unauthorized", detail);
export const forbidden = (detail = "You do not have access to this resource") =>
  new ProblemError(403, "Forbidden", detail);
export const notFound = (detail = "The requested resource was not found") =>
  new ProblemError(404, "Not Found", detail);
export const conflict = (detail: string) => new ProblemError(409, "Conflict", detail);
export const preconditionFailed = (detail = "The resource was modified") =>
  new ProblemError(412, "Precondition Failed", detail);
