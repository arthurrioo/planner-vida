import { describe, expect, it } from "vitest";

import { asUserId } from "@/domain/shared";
import { SupabaseTransactionRepository } from "./supabase-transaction-repository";

describe("SupabaseTransactionRepository", () => {
  it("uses a unique deterministic statement ordering before applying offset pagination", async () => {
    const orders: Array<Readonly<{ ascending: boolean; column: string }>> = [];
    const supabase = {
      from(table: string) {
        expect(table).toBe("transactions");

        const query = {
          eq() {
            return query;
          },
          limit() {
            return Promise.resolve({ data: [], error: null });
          },
          order(column: string, options: Readonly<{ ascending?: boolean }>) {
            orders.push({
              ascending: options.ascending !== false,
              column,
            });
            return query;
          },
          select() {
            return query;
          },
        };

        return query;
      },
    };
    const repository = new SupabaseTransactionRepository(supabase as never);

    await repository.list({
      userId: asUserId("00000000-0000-4000-8000-000000011991"),
    });

    expect(orders).toEqual([
      { ascending: false, column: "transaction_date" },
      { ascending: false, column: "created_at" },
      { ascending: false, column: "id" },
    ]);
  });
});
