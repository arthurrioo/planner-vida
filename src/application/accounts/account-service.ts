import { AccountService } from "@/domain/accounts";
import {
  SupabaseAccountAuditService,
  SupabaseAccountRepository,
} from "@/infrastructure/accounts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createAccountService() {
  const supabase = await createServerSupabaseClient();

  return new AccountService({
    audit: new SupabaseAccountAuditService(supabase),
    repository: new SupabaseAccountRepository(supabase),
  });
}
