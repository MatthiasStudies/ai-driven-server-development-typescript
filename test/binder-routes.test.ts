import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemError, problemFromError } from "../src/http/problem.js";
import type { Database } from "../src/repositories/binders.js";
import { createBinderRoutes } from "../src/routes/binders.js";

const state = vi.hoisted(() => ({
  item: undefined as
    | { id: number; name: string; description: string | null; ownerUserId: string; version: number }
    | undefined,
}));

vi.mock("../src/repositories/binders.js", () => ({
  binderRepository: () => ({
    list: async () => ({ data: state.item ? [state.item] : [], meta: {} }),
    get: async (owner: string, id: number) =>
      state.item?.ownerUserId === owner && state.item.id === id ? { ...state.item } : undefined,
    create: async (owner: string, input: { name: string; description?: string | null }) => {
      state.item = {
        id: 1,
        name: input.name,
        description: input.description ?? null,
        ownerUserId: owner,
        version: 1,
      };
      return { ...state.item };
    },
    replace: async (
      owner: string,
      id: number,
      version: number,
      input: { name: string; description: string | null },
    ) => {
      if (
        state.item?.ownerUserId !== owner ||
        state.item.id !== id ||
        state.item.version !== version
      )
        return undefined;
      state.item = { ...state.item, ...input, version: version + 1 };
      return { ...state.item };
    },
  }),
}));

const app = new Hono<{ Variables: { subject: string } }>();
app.use("*", async (c, next) => {
  c.set("subject", "collector-1");
  await next();
});
app.route("/", createBinderRoutes({} as Database));
app.onError((error, c) => {
  if (error instanceof ProblemError) return problemFromError(c, error);
  throw error;
});

beforeEach(() => {
  state.item = undefined;
});

describe("binder routes with stub repository", () => {
  it("creates, conditionally reads, and replaces with concurrency protection", async () => {
    const created = await app.request("/binders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "First" }),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("location")).toBe("/binders/1");
    const tag = created.headers.get("etag");
    expect(tag).toBeTruthy();

    const cached = await app.request("/binders/1", { headers: { "if-none-match": tag! } });
    expect(cached.status).toBe(304);

    const update = () =>
      app.request("/binders/1", {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": tag! },
        body: JSON.stringify({ name: "Updated", description: null }),
      });
    const updated = await update();
    expect(updated.status).toBe(200);
    expect(updated.headers.get("etag")).not.toBe(tag);
    const stale = await update();
    expect(stale.status).toBe(412);
    expect(stale.headers.get("content-type")).toContain("application/problem+json");
  });

  it("rejects invalid inputs and requests without a precondition", async () => {
    const invalid = await app.request("/binders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(invalid.status).toBe(400);
    const missing = await app.request("/binders/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Name", description: null }),
    });
    expect(missing.status).toBe(428);
  });
});
