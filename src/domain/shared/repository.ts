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
    throw new Error("UserId is required.");
  }

  return value as UserId;
}

export function assertOwnedByContext(
  context: RepositoryContext,
  record: OwnedRecord,
) {
  if (record.userId !== context.userId) {
    throw new Error("Owned record user_id must match the repository context.");
  }
}
