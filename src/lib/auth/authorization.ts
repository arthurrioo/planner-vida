export type AppRole = "admin" | "user";

export type AuthenticatedActor = {
  id: string;
  roles: AppRole[];
};

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertAuthenticated(
  actor: AuthenticatedActor | null | undefined,
): asserts actor is AuthenticatedActor {
  if (!actor?.id) {
    throw new AuthorizationError("Authentication is required.");
  }
}

export function isOwner(actor: AuthenticatedActor, ownerUserId: string) {
  return actor.id === ownerUserId;
}

export function assertOwner(actor: AuthenticatedActor, ownerUserId: string) {
  if (!isOwner(actor, ownerUserId)) {
    throw new AuthorizationError(
      "Only the owning user can access this record.",
    );
  }
}

export function isHumanAdmin(actor: AuthenticatedActor) {
  return actor.roles.includes("admin");
}

export function canReadAggregateAdminObservability(
  actor: AuthenticatedActor | null | undefined,
) {
  return Boolean(actor?.roles.includes("admin"));
}

export function canReadOwnedFinancialRecord(
  actor: AuthenticatedActor | null | undefined,
  ownerUserId: string,
) {
  return Boolean(actor && isOwner(actor, ownerUserId));
}
