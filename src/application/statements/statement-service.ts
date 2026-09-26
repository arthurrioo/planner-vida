import { createAccountService } from "@/application/accounts/account-service";
import { StatementService } from "@/domain/statements";
import {
  SupabaseTransactionReferenceRepository,
  SupabaseTransactionRepository,
} from "@/infrastructure/transactions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createStatementService() {
  const supabase = await createServerSupabaseClient();
  const accountService = await createAccountService();

  return new StatementService({
    accountService,
    references: new SupabaseTransactionReferenceRepository(supabase),
    transactions: new SupabaseTransactionRepository(supabase),
  });
}
