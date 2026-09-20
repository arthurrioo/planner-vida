import { TransactionService } from "@/domain/transactions";
import { type Logger } from "@/domain/shared";
import { SupabasePrivilegedAuditService } from "@/infrastructure/audit";
import {
  SupabaseTransactionReferenceRepository,
  SupabaseTransactionRepository,
} from "@/infrastructure/transactions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const serverLogger: Logger = {
  emit(event) {
    console.error(JSON.stringify(event));
  },
};

export async function createTransactionService() {
  const supabase = await createServerSupabaseClient();

  return new TransactionService({
    audit: new SupabasePrivilegedAuditService(),
    logger: serverLogger,
    references: new SupabaseTransactionReferenceRepository(supabase),
    repository: new SupabaseTransactionRepository(supabase),
  });
}
