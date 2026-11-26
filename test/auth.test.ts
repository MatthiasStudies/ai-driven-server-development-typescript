import { Hono } from "hono";
import { CompactSign, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { JWTPayload } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthMiddleware } from "../src/auth/keycloak.js";
import type { AuthEnv } from "../src/auth/keycloak.js";

const issuer = "https://identity.example/realms/tcg";
const audience = "tcg-api";
const config = { issuer, audience, jwksUrl: `${issuer}/certs` };
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let jwk: Record<string, unknown>;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
  jwk = { ...(await exportJWK(keys.publicKey)), kid: "key-1", alg: "RS256", use: "sig" };
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
});

afterEach(() => vi.unstubAllGlobals());

function app() {
  const api = new Hono<AuthEnv>();
  api.use("*", createAuthMiddleware(config));
  api.get("/", (c) => c.json({ subject: c.get("subject") }));
  return api;
}

async function token(overrides: JWTPayload = {}, key = privateKey, kid = "key-1") {
  return new SignJWT({
    iss: issuer,
    aud: audience,
    sub: "user-123",
    exp: Math.floor(Date.now() / 1000) + 300,
    realm_access: { roles: ["collector"] },
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid })
    .sign(key);
}

async function request(jwt?: string) {
  return app().request("/", { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
}

describe("Keycloak authorization", () => {
  it("requires a configured audience", () => {
    expect(() => createAuthMiddleware({ ...config, audience: "" })).toThrow();
  });

  it("returns a bearer challenge for absent and malformed authorization", async () => {
    for (const authorization of [undefined, "Basic abc", "Bearer", "Bearer token extra"]) {
      const response = await app().request("/", {
        headers: authorization ? { Authorization: authorization } : {},
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect((await response.json()).status).toBe(401);
    }
  });

  it("verifies a token, propagates the subject, and caches the JWKS", async () => {
    const api = app();
    const jwt = await token();
    for (let i = 0; i < 2; i++) {
      const response = await api.request("/", { headers: { Authorization: `bearer ${jwt}` } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ subject: "user-123" });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when the realm collector role is missing or malformed", async () => {
    for (const realm_access of [{ roles: [] }, { roles: "collector" }, null, ["collector"]]) {
      const response = await request(await token({ realm_access }));
      expect(response.status).toBe(403);
      expect((await response.json()).status).toBe(403);
    }
  });

  it("rejects invalid signatures, key ids, claims, and malformed tokens", async () => {
    const tokens = [
      "not.a.jwt",
      await token({}, otherPrivateKey),
      await token({}, privateKey, "unknown"),
      await token({ iss: "https://other.example" }),
      await token({ aud: "other-api" }),
      await token({ aud: undefined }),
      await token({ exp: Math.floor(Date.now() / 1000) - 1 }),
      await token({ nbf: Math.floor(Date.now() / 1000) + 300 }),
      await token({ exp: undefined }),
      await token({ sub: undefined }),
      await token({ sub: "  " }),
    ];
    for (const jwt of tokens) {
      const response = await request(jwt);
      expect(response.status, `token ${tokens.indexOf(jwt)}`).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    }
  });

  it("rejects a signed token with an infinite expiry", async () => {
    const payload = `{"iss":"${issuer}","aud":"${audience}","sub":"user-123","exp":1e999,"realm_access":{"roles":["collector"]}}`;
    const jwt = await new CompactSign(new TextEncoder().encode(payload))
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .sign(privateKey);
    expect((await request(jwt)).status).toBe(401);
  });

  it("rejects algorithms other than RS256", async () => {
    const jwt = await new SignJWT({
      sub: "user-123",
      iss: issuer,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 300,
    })
      .setProtectedHeader({ alg: "HS256", kid: "key-1" })
      .sign(new TextEncoder().encode("test-secret-not-a-real-key"));
    expect((await request(jwt)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when JWKS cannot be fetched or is invalid", async () => {
    for (const implementation of [
      async () => {
        throw new TypeError("network error with secret");
      },
      async () => new Response("unavailable", { status: 503 }),
      async () => new Response("not json", { status: 200 }),
      async () => Response.json({ invalid: "jwks" }),
    ]) {
      vi.stubGlobal("fetch", vi.fn(implementation));
      const response = await request(await token());
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(body).not.toContain("secret");
      expect(JSON.parse(body).status).toBe(503);
      expect(response.headers.get("www-authenticate")).toBeNull();
    }
  });
});
