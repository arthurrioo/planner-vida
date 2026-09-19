import { DomainError } from "./domain-error";
import { createFingerprint } from "./normalization";

export type IdempotencyStatus = "in_progress" | "completed" | "failed";

export type IdempotencyRecord<TResult> = Readonly<{
  key: string;
  status: IdempotencyStatus;
  requestFingerprint: string;
  result?: TResult;
}>;

export type IdempotencyClaimResult = "claimed" | "already_exists";

export type IdempotencyRepository<TResult> = Readonly<{
  /**
   * Must be implemented with an atomic insert-if-absent/unique-key claim.
   * Later persistence layers should enforce uniqueness on the idempotency key.
   */
  claimInProgress(
    record: IdempotencyRecord<TResult>,
  ): Promise<IdempotencyClaimResult>;
  findByKey(key: string): Promise<IdempotencyRecord<TResult> | null>;
  markCompleted(key: string, result: TResult): Promise<void>;
  markFailed(key: string): Promise<void>;
}>;

export function createIdempotencyKey(parts: readonly string[]) {
  return createFingerprint(parts);
}

export async function runIdempotent<TResult>(input: {
  key: string;
  requestFingerprint: string;
  repository: IdempotencyRepository<TResult>;
  execute: () => Promise<TResult>;
}) {
  const claimResult = await input.repository.claimInProgress({
    key: input.key,
    requestFingerprint: input.requestFingerprint,
    status: "in_progress",
  });

  if (claimResult === "already_exists") {
    const existing = await input.repository.findByKey(input.key);

    if (!existing) {
      throw new DomainError(
        "CONFLICT",
        "Idempotency claim already existed but could not be reloaded.",
      );
    }

    return resolveExistingIdempotencyRecord(existing, input.requestFingerprint);
  }

  try {
    const result = await input.execute();
    await input.repository.markCompleted(input.key, result);
    return result;
  } catch (error) {
    await input.repository.markFailed(input.key);
    throw error;
  }
}

function resolveExistingIdempotencyRecord<TResult>(
  existing: IdempotencyRecord<TResult>,
  requestFingerprint: string,
) {
  if (existing.requestFingerprint !== requestFingerprint) {
    throw new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used with a different request.",
    );
  }

  if (existing.status === "completed") {
    return existing.result as TResult;
  }

  if (existing.status === "failed") {
    throw new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotent operation previously failed.",
    );
  }

  throw new DomainError(
    "IDEMPOTENCY_CONFLICT",
    "Idempotent operation is already in progress.",
  );
}
