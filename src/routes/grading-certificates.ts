import { Hono } from "hono";
import { conflict, notFound } from "../http/problem.js";
import { jsonResource, noQuery, pathId, subject, type AuthenticatedEnv } from "../http/resource.js";
import { jsonBody, validate } from "../http/validate.js";
import type { Database } from "../repositories/binders.js";
import { certificateRepository, isCertificateConflict } from "../repositories/certificates.js";
import { createCertificateSchema } from "../validation/resources.js";

/** Mount at the application root, after authentication middleware. */
export function createGradingCertificateRoutes(database: Database) {
  const routes = new Hono<AuthenticatedEnv>();
  const repository = certificateRepository(database);

  routes.get("/cards/:cardId/grading-certificate", async (c) => {
    const owner = subject(c);
    noQuery(c);
    const item = await repository.get(owner, pathId(c.req.param("cardId")));
    if (!item) throw notFound();
    return jsonResource(c, item, 200, true);
  });
  routes.post("/cards/:cardId/grading-certificate", async (c) => {
    const owner = subject(c);
    noQuery(c);
    const cardId = pathId(c.req.param("cardId"));
    const input = validate(createCertificateSchema, await jsonBody(c.req.raw));
    try {
      const item = await repository.create(owner, cardId, input);
      if (!item) throw notFound();
      c.header("Location", `/cards/${cardId}/grading-certificate`);
      return jsonResource(c, item, 201);
    } catch (error) {
      if (isCertificateConflict(error)) throw conflict("Card already has a certificate or certificate number is in use");
      throw error;
    }
  });
  return routes;
}
