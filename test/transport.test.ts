import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { connect, createServer as createHttp2Server } from "node:http2";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { healthRoutes } from "../src/routes/health.js";

const app = new Hono().route("/health", healthRoutes);
const http1Server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
const http2Server = serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port: 0,
  createServer: createHttp2Server,
});

function waitListening(server: typeof http1Server): Promise<void> {
  if (server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function port(server: typeof http1Server): number {
  return (server.address() as AddressInfo).port;
}

beforeAll(async () => {
  await Promise.all([waitListening(http1Server), waitListening(http2Server)]);
});

afterAll(async () => {
  await Promise.all(
    [http1Server, http2Server].map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

describe("HTTP transport", () => {
  it("serves HTTP/1.1", async () => {
    const response = await fetch(`http://127.0.0.1:${port(http1Server)}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("serves cleartext HTTP/2 using prior knowledge", async () => {
    const client = connect(`http://127.0.0.1:${port(http2Server)}`);
    try {
      const result = await new Promise<{ status: number | undefined; body: string }>(
        (resolve, reject) => {
          const request = client.request({ ":path": "/health" });
          let status: number | undefined;
          let body = "";
          request.setEncoding("utf8");
          request.on("response", (headers) => {
            status = headers[":status"];
          });
          request.on("data", (chunk: string) => {
            body += chunk;
          });
          request.on("end", () => resolve({ status, body }));
          request.on("error", reject);
          client.on("error", reject);
          request.end();
        },
      );
      expect(result.status).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ status: "ok" });
    } finally {
      client.close();
    }
  });
});
