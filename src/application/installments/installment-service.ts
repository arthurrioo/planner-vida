import { InstallmentService } from "@/domain/installments";
import { type Logger } from "@/domain/shared";
import { SupabasePrivilegedAuditService } from "@/infrastructure/audit";
import {
  SupabaseInstallmentReferenceRepository,
  SupabaseInstallmentRepository,
} from "@/infrastructure/installments";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const serverLogger: Logger = {
  emit(event) {
    console.error(JSON.stringify(event));
  },
};

export async function createInstallmentService() {
  const supabase = await createServerSupabaseClient();

  return new InstallmentService({
    audit: new SupabasePrivilegedAuditService(),
    logger: serverLogger,
    references: new SupabaseInstallmentReferenceRepository(supabase),
    repository: new SupabaseInstallmentRepository(supabase),
  });
}
