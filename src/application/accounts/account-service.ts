import { AccountService } from "@/domain/accounts";
import { type Logger } from "@/domain/shared";
import { SupabasePrivilegedAuditService } from "@/infrastructure/audit";
import { SupabaseAccountRepository } from "@/infrastructure/accounts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const serverLogger: Logger = {
  emit(event) {
    console.error(JSON.stringify(event));
  },
};

export async function createAccountService() {
  const supabase = await createServerSupabaseClient();

  return new AccountService({
    audit: new SupabasePrivilegedAuditService(),
    logger: serverLogger,
    repository: new SupabaseAccountRepository(supabase),
  });
}
