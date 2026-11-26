import { Hono } from "hono";
import { ifMatch, representationEtag } from "../http/etag.js";
import { notFound, preconditionFailed } from "../http/problem.js";
import { jsonResource, noQuery, pathId, requireIfMatch, subject, type AuthenticatedEnv } from "../http/resource.js";
import { jsonBody, validate } from "../http/validate.js";
import { binderRepository, type Database } from "../repositories/binders.js";
import { createBinderSchema, replaceBinderSchema } from "../validation/resources.js";

/** Mount at the application root, after authentication middleware. */
export function createBinderRoutes(database: Database) {
  const routes = new Hono<AuthenticatedEnv>();
  const repository = binderRepository(database);

  routes.get("/binders", async (c) => {
    const owner = subject(c);
    const result = await repository.list(owner, new URL(c.req.url).searchParams);
    return jsonResource(c, result, 200, true);
  });
  routes.get("/binders/:id", async (c) => {
    const owner = subject(c);
    noQuery(c);
    const item = await repository.get(owner, pathId(c.req.param("id")));
    if (!item) throw notFound();
    return jsonResource(c, item, 200, true);
  });
  routes.post("/binders", async (c) => {
    const owner = subject(c);
    noQuery(c);
    const input = validate(createBinderSchema, await jsonBody(c.req.raw));
    const item = await repository.create(owner, input);
    c.header("Location", `/binders/${item.id}`);
    return jsonResource(c, item, 201);
  });
  routes.put("/binders/:id", async (c) => {
    const owner = subject(c);
    noQuery(c);
    const id = pathId(c.req.param("id"));
    const input = validate(replaceBinderSchema, await jsonBody(c.req.raw));
    const match = requireIfMatch(c);
    const current = await repository.get(owner, id);
    if (!current) throw notFound();
    if (!ifMatch(match, representationEtag(current))) throw preconditionFailed();
    const item = await repository.replace(owner, id, match.trim() === "*" ? null : current.version, input);
    if (!item) {
      if (!(await repository.get(owner, id))) throw notFound();
      throw preconditionFailed();
    }
    return jsonResource(c, item);
  });
  return routes;
}
