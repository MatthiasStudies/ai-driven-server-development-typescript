import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { forbidden, problemFromError, problemResponse, unauthorized } from "../http/problem.js";

export type AuthVariables = { subject: string };
export type AuthEnv = { Variables: AuthVariables };

export interface AuthConfig {
  issuer: string;
  jwksUrl: string;
  /** The intended API audience, which Keycloak must include in access tokens. */
  audience: string;
}

class JwksUnavailableError extends Error {}

/** Authenticate Keycloak access tokens and require the collector realm role. */
export function createAuthMiddleware(config: AuthConfig): MiddlewareHandler<AuthEnv> {
  if (!config.issuer.trim() || !config.audience.trim()) {
    throw new TypeError("An issuer and backend audience are required");
  }

  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  // Errors from key retrieval, unlike token/key mismatches, indicate an upstream failure.
  const resolveKey = async (...args: Parameters<typeof jwks>) => {
    try {
      return await jwks(...args);
    } catch (error) {
      if (
        error instanceof errors.JWKSNoMatchingKey ||
        error instanceof errors.JWKSMultipleMatchingKeys
      ) {
        throw error;
      }
      throw new JwksUnavailableError();
    }
  };

  return async (c, next) => {
    const authorization = c.req.header("Authorization");
    const match = authorization?.match(/^Bearer[\t ]+([A-Za-z0-9\-._~+/]+=*)$/i);
    if (!match?.[1]) {
      c.header("WWW-Authenticate", "Bearer");
      return problemFromError(c, unauthorized());
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(match[1], resolveKey, {
        algorithms: ["RS256"],
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ["exp", "sub"],
      }));
    } catch (error) {
      if (error instanceof JwksUnavailableError) {
        return problemResponse(
          c,
          503,
          "Service Unavailable",
          "Authentication service is unavailable",
        );
      }
      c.header("WWW-Authenticate", 'Bearer error="invalid_token"');
      return problemFromError(c, unauthorized("Invalid or expired access token"));
    }

    if (
      typeof payload.sub !== "string" ||
      !payload.sub.trim() ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp)
    ) {
      c.header("WWW-Authenticate", 'Bearer error="invalid_token"');
      return problemFromError(c, unauthorized("Invalid or expired access token"));
    }

    const realmAccess = payload.realm_access;
    if (
      !realmAccess ||
      typeof realmAccess !== "object" ||
      !("roles" in realmAccess) ||
      !Array.isArray(realmAccess.roles) ||
      !realmAccess.roles.includes("collector")
    ) {
      return problemFromError(c, forbidden("The collector role is required"));
    }

    c.set("subject", payload.sub);
    await next();
  };
}
