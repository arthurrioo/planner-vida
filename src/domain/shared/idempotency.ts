import { DomainError } from "./domain-error";
import { createFingerprint } from "./normalization";

export type IdempotencyStatus = "in_progress" | "completed" | "failed";

export type IdempotencyRecord<TResult> = Readonly<{
  key: string;
  status: IdempotencyStatus;
  requestFingerprint: string;
  result?: TResult;
}>;

export type IdempotencyRepository<TResult> = Readonly<{
  findByKey(key: string): Promise<IdempotencyRecord<TResult> | null>;
  createInProgress(record: IdempotencyRecord<TResult>): Promise<void>;
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
  const existing = await input.repository.findByKey(input.key);

  if (existing) {
    if (existing.requestFingerprint !== input.requestFingerprint) {
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key was already used with a different request.",
      );
    }

    if (existing.status === "completed") {
      return existing.result as TResult;
    }

    throw new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotent operation is already in progress or failed.",
    );
  }

  await input.repository.createInProgress({
    key: input.key,
    requestFingerprint: input.requestFingerprint,
    status: "in_progress",
  });

  try {
    const result = await input.execute();
    await input.repository.markCompleted(input.key, result);
    return result;
  } catch (error) {
    await input.repository.markFailed(input.key);
    throw error;
  }
}
