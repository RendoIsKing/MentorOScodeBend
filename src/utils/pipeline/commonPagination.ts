/**
 * Legacy pagination pipeline — no longer used with Supabase.
 *
 * Use `paginate()` from `src/lib/db.ts` instead.
 * This file is kept as a no-op export for any code that still imports it.
 */
export const commonPaginationPipeline = (
  page: number,
  perPage: number,
  skip: number
): any[] => {
  console.warn("[DEPRECATION] commonPaginationPipeline is deprecated. Use paginate() from src/lib/db.ts");
  return [];
};
