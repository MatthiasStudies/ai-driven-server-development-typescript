import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../http/validate.js";

const healthQuery = z.strictObject({});

export const healthRoutes = new Hono().get("/", (c) => {
  validate(healthQuery, Object.fromEntries(new URL(c.req.url).searchParams));
  return c.json({ status: "ok" });
});
