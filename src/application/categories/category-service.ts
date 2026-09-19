import { CategoryService } from "@/domain/categories";
import { type Logger } from "@/domain/shared";
import { SupabasePrivilegedAuditService } from "@/infrastructure/audit";
import { SupabaseCategoryRepository } from "@/infrastructure/categories";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const serverLogger: Logger = {
  emit(event) {
    console.error(JSON.stringify(event));
  },
};

export async function createCategoryService() {
  const supabase = await createServerSupabaseClient();

  return new CategoryService({
    audit: new SupabasePrivilegedAuditService(),
    logger: serverLogger,
    repository: new SupabaseCategoryRepository(supabase),
  });
}
