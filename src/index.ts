import { serve } from "@hono/node-server";
import { createServer as createHttp2Server } from "node:http2";
import { createApp } from "./app.js";
import { getEnv } from "./env.js";

const env = getEnv();
const app = createApp();

const http1Server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`tcg-card-stack HTTP/1.1 listening on http://localhost:${info.port}`);
  },
);

const http2Server = serve(
  {
    fetch: app.fetch,
    port: env.HTTP2_PORT,
    createServer: createHttp2Server,
  },
  (info) => {
    console.log(`tcg-card-stack HTTP/2 (h2c) listening on http://localhost:${info.port}`);
  },
);

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const closeServer = (server: { close: (callback?: () => void) => void }) =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

  void Promise.all([closeServer(http1Server), closeServer(http2Server)]).finally(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 5_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, shutdown);
}
