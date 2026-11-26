import { Hono } from "hono";
import { ProblemError, problemFromError, problemResponse } from "./http/problem.js";
import { healthRoutes } from "./routes/health.js";

export function createApp() {
  const app = new Hono();

  app.route("/health", healthRoutes);

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
