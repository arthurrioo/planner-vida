import { TransferService } from "@/domain/transfers";
import { type Logger } from "@/domain/shared";
import { SupabasePrivilegedAuditService } from "@/infrastructure/audit";
import {
  SupabaseTransferReferenceRepository,
  SupabaseTransferRepository,
} from "@/infrastructure/transfers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const serverLogger: Logger = {
  emit(event) {
    console.error(JSON.stringify(event));
  },
};

export async function createTransferService() {
  const supabase = await createServerSupabaseClient();

  return new TransferService({
    audit: new SupabasePrivilegedAuditService(),
    logger: serverLogger,
    references: new SupabaseTransferReferenceRepository(supabase),
    repository: new SupabaseTransferRepository(supabase),
  });
}
