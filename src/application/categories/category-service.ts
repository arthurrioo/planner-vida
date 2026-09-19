import { CategoryService } from "@/domain/categories";
import {
  SupabaseCategoryAuditService,
  SupabaseCategoryRepository,
} from "@/infrastructure/categories";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createCategoryService() {
  const supabase = await createServerSupabaseClient();

  return new CategoryService({
    audit: new SupabaseCategoryAuditService(supabase),
    repository: new SupabaseCategoryRepository(supabase),
  });
}
