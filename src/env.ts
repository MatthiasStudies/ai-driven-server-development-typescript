import { z } from "zod";

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HTTP2_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1),
    KEYCLOAK_ISSUER: z.url().default("http://localhost:8080/realms/tcg-card-stack"),
    KEYCLOAK_JWKS_URL: z.url().optional(),
    KEYCLOAK_AUDIENCE: z.string().min(1).default("tcg-api"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .refine((env) => env.PORT !== env.HTTP2_PORT, {
    message: "HTTP2_PORT must differ from PORT",
    path: ["HTTP2_PORT"],
  })
  .transform((env) => ({
    ...env,
    KEYCLOAK_JWKS_URL:
      env.KEYCLOAK_JWKS_URL ?? `${env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`,
  }));

export type Env = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv();
  return cached;
}
