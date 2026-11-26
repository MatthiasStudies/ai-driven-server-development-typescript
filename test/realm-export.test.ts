import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface RealmUser {
  username: string;
  enabled: boolean;
  email: string;
  firstName: string;
  lastName: string;
  realmRoles?: string[];
  credentials: { type: string; value: string; temporary: boolean }[];
}

const realm = JSON.parse(
  readFileSync(new URL("../keycloak/realm-export.json", import.meta.url), "utf8"),
) as { users: RealmUser[] };

describe("Keycloak demo users", () => {
  it.each([
    ["collector", true],
    ["collector2", true],
    ["noncollector", false],
  ])("configures a complete profile and intended role for %s", (username, hasCollectorRole) => {
    const user = realm.users.find((entry) => entry.username === username);
    expect(user).toBeDefined();
    expect(user?.enabled).toBe(true);
    expect(user?.firstName?.trim()).toBeTruthy();
    expect(user?.lastName?.trim()).toBeTruthy();
    expect(user?.email?.trim()).toBeTruthy();
    expect(user?.credentials).toContainEqual({
      type: "password",
      value: username,
      temporary: false,
    });
    expect(user?.realmRoles?.includes("collector") ?? false).toBe(hasCollectorRole);
  });
});
