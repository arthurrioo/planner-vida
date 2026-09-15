import { describe, expect, it } from "vitest";
import {
  type AppRole,
  AuthorizationError,
  assertAuthenticated,
  assertOwner,
  canReadAggregateAdminObservability,
  canReadOwnedFinancialRecord,
  isHumanAdmin,
  isOwner,
} from "./authorization";
import { getLoginPath, getSafeNextPath, isProtectedPath } from "./routes";

const owner = {
  id: "user-a",
  roles: ["user"] satisfies AppRole[],
};

const admin = {
  id: "user-b",
  roles: ["user", "admin"] satisfies AppRole[],
};

describe("authorization helpers", () => {
  it("requires an authenticated actor", () => {
    expect(() => assertAuthenticated(null)).toThrow(AuthorizationError);
    expect(() => assertAuthenticated(owner)).not.toThrow();
  });

  it("allows only owner access to owned financial records", () => {
    expect(isOwner(owner, "user-a")).toBe(true);
    expect(canReadOwnedFinancialRecord(owner, "user-a")).toBe(true);
    expect(canReadOwnedFinancialRecord(owner, "user-b")).toBe(false);
    expect(canReadOwnedFinancialRecord(admin, "user-a")).toBe(false);
    expect(() => assertOwner(owner, "user-b")).toThrow(AuthorizationError);
  });

  it("keeps human admin scoped to aggregate observability", () => {
    expect(isHumanAdmin(admin)).toBe(true);
    expect(canReadAggregateAdminObservability(admin)).toBe(true);
    expect(canReadAggregateAdminObservability(owner)).toBe(false);
  });
});

describe("auth route helpers", () => {
  it("normalizes unsafe redirect targets to the protected shell", () => {
    expect(getSafeNextPath("/app/profile")).toBe("/app/profile");
    expect(getSafeNextPath("https://example.invalid/app")).toBe("/app");
    expect(getSafeNextPath("/admin")).toBe("/app");
    expect(getLoginPath("/app/profile")).toBe("/login?next=%2Fapp%2Fprofile");
  });

  it("detects protected routes", () => {
    expect(isProtectedPath("/app")).toBe(true);
    expect(isProtectedPath("/app/profile")).toBe(true);
    expect(isProtectedPath("/login")).toBe(false);
  });
});
