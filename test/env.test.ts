import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env.js";

const DATABASE_URL = "postgres://user:password@localhost:5432/tcg_tracker";

describe("environment configuration", () => {
  it("provides separate HTTP/1 and HTTP/2 ports and a derived JWKS URL", () => {
    const env = parseEnv({ DATABASE_URL });

    expect(env.PORT).toBe(3000);
    expect(env.HTTP2_PORT).toBe(3001);
    expect(env.KEYCLOAK_AUDIENCE).toBe("tcg-api");
    expect(env.KEYCLOAK_JWKS_URL).toBe(
      "http://localhost:8080/realms/tcg-card-stack/protocol/openid-connect/certs",
    );
  });

  it("accepts a separately configured JWKS URL", () => {
    const env = parseEnv({
      DATABASE_URL,
      PORT: "4000",
      HTTP2_PORT: "4001",
      KEYCLOAK_JWKS_URL: "http://localhost:8080/keys",
    });
    expect(env.PORT).toBe(4000);
    expect(env.HTTP2_PORT).toBe(4001);
    expect(env.KEYCLOAK_JWKS_URL).toBe("http://localhost:8080/keys");
  });

  it("rejects missing database configuration and duplicate ports", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL, PORT: "4000", HTTP2_PORT: "4000" })).toThrow(
      /HTTP2_PORT/,
    );
  });
});
