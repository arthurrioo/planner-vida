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

  async findByKey(key: string) {
    return this.records.get(key) ?? null;
  }

  async createInProgress(record: IdempotencyRecord<TResult>) {
    this.records.set(record.key, record);
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
});
