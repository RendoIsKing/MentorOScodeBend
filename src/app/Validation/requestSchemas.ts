import { z } from "zod";

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
export const nonEmptyString = z.string().trim().min(1);

export const objectIdParam = (key: string = "id") =>
  z.object({ [key]: objectId } as Record<string, z.ZodTypeAny>).strict();

export const optionalObjectIdParam = (key: string = "id") =>
  z.object({ [key]: objectId.optional() } as Record<string, z.ZodTypeAny>).strict();

export const limitQuery = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isFinite(v) && v > 0), "limit must be a positive number"),
}).strict();
