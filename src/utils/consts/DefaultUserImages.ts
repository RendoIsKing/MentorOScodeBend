// Legacy MongoDB ObjectIds – not valid UUIDs.
// Set to null so Supabase UUID FK columns don't reject them.
// TODO: Upload default images to Supabase Storage and insert proper file rows.
export const default_user_cover: string | null = null;
export const default_user_pfp: string | null = null;
