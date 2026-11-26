import { Hono } from "hono";
import { ifMatch, representationEtag } from "../http/etag.js";
import { notFound, preconditionFailed } from "../http/problem.js";
import {
  jsonResource,
  noQuery,
  pathId,
  requireIfMatch,
  subject,
  type AuthenticatedEnv,
} from "../http/resource.js";
import { jsonBody, validate } from "../http/validate.js";
import type { Database } from "../repositories/binders.js";
import { cardRepository } from "../repositories/cards.js";
import { createCardSchema, replaceCardSchema } from "../validation/resources.js";

/** Mount at the application root, after authentication middleware. */
export function createCardRoutes(database: Database) {
  const routes = new Hono<AuthenticatedEnv>();
  const repository = cardRepository(database);

  routes.get("/cards", async (c) => {
    const owner = subject(c);
    const result = await repository.list(owner, new URL(c.req.url).searchParams);
    return jsonResource(c, result, 200, true);
  });
  routes.get("/cards/:id", async (c) => {
    const owner = subject(c);
    noQuery(c);
    const item = await repository.get(owner, pathId(c.req.param("id")));
    if (!item) throw notFound();
    return jsonResource(c, item, 200, true);
  });
  routes.post("/cards", async (c) => {
    const owner = subject(c);
    noQuery(c);
    const input = validate(createCardSchema, await jsonBody(c.req.raw));
    const item = await repository.create(owner, input);
    if (!item) throw notFound("The target binder was not found");
    c.header("Location", `/cards/${item.id}`);
    return jsonResource(c, item, 201);
  });
  routes.put("/cards/:id", async (c) => {
    const owner = subject(c);
    noQuery(c);
    const id = pathId(c.req.param("id"));
    const input = validate(replaceCardSchema, await jsonBody(c.req.raw));
    const match = requireIfMatch(c);
    const current = await repository.get(owner, id);
    if (!current) throw notFound();
    if (!(await repository.ownsBinder(owner, input.binderId)))
      throw notFound("The target binder was not found");
    if (!ifMatch(match, representationEtag(current))) throw preconditionFailed();
    const updated = await repository.replace(owner, id, current.version, input);
    if (!updated) {
      if (!(await repository.get(owner, id))) throw notFound();
      if (!(await repository.ownsBinder(owner, input.binderId)))
        throw notFound("The target binder was not found");
      throw preconditionFailed();
    }
    const item = await repository.get(owner, id);
    if (!item) throw notFound();
    return jsonResource(c, item);
  });
  return routes;
}
