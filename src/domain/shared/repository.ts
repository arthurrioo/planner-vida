import { DomainError } from "./domain-error";

export type UserId = string & { readonly __brand: "UserId" };

export type RepositoryContext = Readonly<{
  userId: UserId;
  requestId?: string;
}>;

export type OwnedRecord = Readonly<{
  id: string;
  userId: UserId;
}>;

export type OwnedRepository<TRecord extends OwnedRecord> = Readonly<{
  findById(context: RepositoryContext, id: string): Promise<TRecord | null>;
  save(context: RepositoryContext, record: TRecord): Promise<TRecord>;
}>;

export function asUserId(value: string): UserId {
  if (!value.trim()) {
    throw new DomainError("VALIDATION_FAILED", "UserId is required.", {
      details: { field: "userId" },
    });
  }

  return value as UserId;
}

export function assertOwnedByContext(
  context: RepositoryContext,
  record: OwnedRecord,
) {
  if (record.userId !== context.userId) {
    throw new DomainError(
      "OWNERSHIP_MISMATCH",
      "Owned record user_id must match the repository context.",
      {
        details: { recordId: record.id },
      },
    );
  }
}
