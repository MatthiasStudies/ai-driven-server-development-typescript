import { Hono } from "hono";
import { createAuthMiddleware, type AuthConfig, type AuthEnv } from "./auth/keycloak.js";
import { ProblemError, problemFromError, problemResponse } from "./http/problem.js";
import type { Database } from "./repositories/binders.js";
import { createBinderRoutes } from "./routes/binders.js";
import { createCardRoutes } from "./routes/cards.js";
import { healthRoutes } from "./routes/health.js";

export interface AppOptions {
  database: Database;
  auth: AuthConfig;
}

export function createApp({ database, auth }: AppOptions) {
  const app = new Hono<AuthEnv>();
  const authenticate = createAuthMiddleware(auth);

  app.route("/health", healthRoutes);
  app.use("/binders/*", authenticate);
  app.use("/cards/*", authenticate);
  app.route("/", createBinderRoutes(database));
  app.route("/", createCardRoutes(database));

  app.notFound((c) => problemResponse(c, 404, "Not Found", "The requested resource was not found"));

  app.onError((error, c) => {
    if (error instanceof ProblemError) {
      return problemFromError(c, error);
    }
    console.error("Unhandled error:", error);
    return problemResponse(c, 500, "Internal Server Error", "An unexpected error occurred");
  });

  return app;
}
