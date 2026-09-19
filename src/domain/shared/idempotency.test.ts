import { describe, expect, it } from "vitest";

import {
  type IdempotencyRecord,
  type IdempotencyRepository,
  createIdempotencyKey,
  runIdempotent,
} from "./index";

class MemoryIdempotencyRepository<
  TResult,
> implements IdempotencyRepository<TResult> {
  records = new Map<string, IdempotencyRecord<TResult>>();

  async claimInProgress(record: IdempotencyRecord<TResult>) {
    if (this.records.has(record.key)) {
      return "already_exists" as const;
    }

    this.records.set(record.key, record);

    return "claimed" as const;
  }

  async findByKey(key: string) {
    return this.records.get(key) ?? null;
  }

  async markCompleted(key: string, result: TResult) {
    const record = this.records.get(key);

    if (!record) {
      throw new Error("Missing idempotency record.");
    }

    this.records.set(key, { ...record, status: "completed", result });
  }

  async markFailed(key: string) {
    const record = this.records.get(key);

    if (!record) {
      throw new Error("Missing idempotency record.");
    }

    this.records.set(key, { ...record, status: "failed" });
  }
}

describe("idempotency helper pattern", () => {
  it("replays completed results for the same key and request fingerprint", async () => {
    const repository = new MemoryIdempotencyRepository<{ id: string }>();
    const key = createIdempotencyKey(["user-a", "create-account", "abc"]);
    const requestFingerprint = createIdempotencyKey(["payload", "abc"]);
    let calls = 0;

    const first = await runIdempotent({
      key,
      requestFingerprint,
      repository,
      execute: async () => {
        calls += 1;
        return { id: "account-a" };
      },
    });
    const second = await runIdempotent({
      key,
      requestFingerprint,
      repository,
      execute: async () => {
        calls += 1;
        return { id: "account-b" };
      },
    });

    expect(first).toEqual({ id: "account-a" });
    expect(second).toEqual({ id: "account-a" });
    expect(calls).toBe(1);
  });

  it("rejects idempotency-key reuse with a different request", async () => {
    const repository = new MemoryIdempotencyRepository<string>();
    const key = createIdempotencyKey(["user-a", "operation"]);

    await runIdempotent({
      key,
      requestFingerprint: "fingerprint-a",
      repository,
      execute: async () => "ok",
    });

    await expect(
      runIdempotent({
        key,
        requestFingerprint: "fingerprint-b",
        repository,
        execute: async () => "bad",
      }),
    ).rejects.toThrow("different request");
  });

  it("does not execute twice when concurrent callers race on the same atomic claim", async () => {
    const repository = new MemoryIdempotencyRepository<{ id: string }>();
    const key = createIdempotencyKey(["user-a", "create-account", "abc"]);
    const requestFingerprint = createIdempotencyKey(["payload", "abc"]);
    let calls = 0;
    let releaseExecution: (value: { id: string }) => void = () => undefined;
    const execution = new Promise<{ id: string }>((resolve) => {
      releaseExecution = resolve;
    });

    const first = runIdempotent({
      key,
      requestFingerprint,
      repository,
      execute: async () => {
        calls += 1;
        return execution;
      },
    });

    await Promise.resolve();

    const second = runIdempotent({
      key,
      requestFingerprint,
      repository,
      execute: async () => {
        calls += 1;
        return { id: "account-b" };
      },
    });

    await expect(second).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      message: "Idempotent operation is already in progress.",
    });

    releaseExecution({ id: "account-a" });

    await expect(first).resolves.toEqual({ id: "account-a" });
    expect(calls).toBe(1);
  });

  it("distinguishes failed claims from completed replay", async () => {
    const repository = new MemoryIdempotencyRepository<string>();
    const key = createIdempotencyKey(["user-a", "operation"]);
    const requestFingerprint = "fingerprint-a";

    await expect(
      runIdempotent({
        key,
        requestFingerprint,
        repository,
        execute: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    await expect(
      runIdempotent({
        key,
        requestFingerprint,
        repository,
        execute: async () => "should-not-run",
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      message: "Idempotent operation previously failed.",
    });
  });

  it("surfaces an explicit conflict if a race-loss cannot be reloaded", async () => {
    const repository: IdempotencyRepository<string> = {
      async claimInProgress() {
        return "already_exists";
      },
      async findByKey() {
        return null;
      },
      async markCompleted() {
        throw new Error("unexpected");
      },
      async markFailed() {
        throw new Error("unexpected");
      },
    };

    await expect(
      runIdempotent({
        key: "key-a",
        requestFingerprint: "fingerprint-a",
        repository,
        execute: async () => "should-not-run",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
