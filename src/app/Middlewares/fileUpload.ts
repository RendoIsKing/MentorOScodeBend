/**
 * File upload middleware — uses Supabase Storage instead of local disk / S3.
 *
 * Files are uploaded to Supabase Storage buckets with multer handling the
 * multipart parsing in memory. After multer processes the file, a custom
 * middleware uploads the buffer to Supabase Storage and attaches the public
 * URL + metadata to `req.file` / `req.files`.
 */
import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../../lib/supabase";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/mpeg",
  "video/x-msvideo",
  "video/quicktime",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
];

// ── Multer: memory storage (file buffer in RAM) ──────────────────────────────

const memoryStorage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type"));
  }
};

/**
 * Create a multer instance that stores files in memory.
 * Compatible with the old `createMulterInstance(path)` API.
 *
 * @param _path - Ignored. Kept for backward compatibility with existing route code.
 */
export function createMulterInstance(_path: string) {
  return multer({
    storage: memoryStorage,
    fileFilter,
    limits: { fileSize: 1024 * 1024 * 50 }, // 50 MB
  });
}

// ── Supabase Storage bucket mapping ──────────────────────────────────────────

/** Map a legacy upload path / route context to a Supabase Storage bucket. */
function resolveBucket(originalPath: string): string {
  const p = originalPath.toLowerCase();
  if (p.includes("avatar") || p.includes("profile") || p.includes("photo")) return "avatars";
  if (p.includes("post") || p.includes("media")) return "posts";
  if (p.includes("document") || p.includes("doc")) return "documents";
  if (p.includes("chat") || p.includes("attachment")) return "chat-attachments";
  // Default bucket
  return "posts";
}

/**
 * Middleware that runs AFTER multer and uploads the file buffer to Supabase
 * Storage, then sets `req.file.path` to the public URL.
 *
 * Usage in routes:
 *   const upload = createMulterInstance('uploads/posts');
 *   router.post('/upload', upload.single('file'), uploadToSupabase('posts'), handler);
 */
export function uploadToSupabase(bucketNameOrPath?: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const files: Express.Multer.File[] = [];
      if (req.file) files.push(req.file);
      if (req.files) {
        if (Array.isArray(req.files)) {
          files.push(...req.files);
        } else {
          for (const fieldFiles of Object.values(req.files)) {
            files.push(...fieldFiles);
          }
        }
      }

      if (files.length === 0) return next();

      const bucket = bucketNameOrPath
        ? resolveBucket(bucketNameOrPath)
        : "posts";

      // Ensure the bucket exists (auto-create if missing)
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      const bucketExists = (buckets || []).some((b: any) => b.name === bucket);
      if (!bucketExists) {
        console.log(`[uploadToSupabase] Bucket "${bucket}" not found – creating it as public…`);
        const { error: createErr } = await supabaseAdmin.storage.createBucket(bucket, {
          public: true,
          fileSizeLimit: 1024 * 1024 * 50,
        });
        if (createErr) {
          console.error(`[uploadToSupabase] Failed to create bucket "${bucket}":`, createErr.message);
        }
      }

      for (const file of files) {
        const ext = file.originalname.split(".").pop() || "bin";
        const storagePath = `${uuidv4()}.${ext}`;

        const { data, error } = await supabaseAdmin.storage
          .from(bucket)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (error) {
          console.error("[uploadToSupabase] upload error:", error.message);
          return next(error);
        }

        // Get public URL
        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from(bucket).getPublicUrl(data.path);

        // Replace multer metadata with Supabase info
        file.path = publicUrl;
        (file as any).storageBucket = bucket;
        (file as any).storagePath = data.path;
        (file as any).publicUrl = publicUrl;
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Delete a file from Supabase Storage by its public URL or storage path.
 */
export async function deleteFromSupabase(
  publicUrlOrPath: string,
  bucket?: string,
): Promise<boolean> {
  try {
    let storagePath = publicUrlOrPath;
    let resolvedBucket = bucket || "posts";

    // If it's a full URL, extract the path and bucket
    if (publicUrlOrPath.startsWith("http")) {
      const url = new URL(publicUrlOrPath);
      const parts = url.pathname.split("/storage/v1/object/public/");
      if (parts[1]) {
        const [b, ...rest] = parts[1].split("/");
        resolvedBucket = b;
        storagePath = rest.join("/");
      }
    }

    const { error } = await supabaseAdmin.storage
      .from(resolvedBucket)
      .remove([storagePath]);

    if (error) {
      console.error("[deleteFromSupabase] error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[deleteFromSupabase] error:", err);
    return false;
  }
}

/**
 * Generate a signed URL for private file access.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error("[getSignedUrl] error:", error.message);
    return null;
  }
  return data.signedUrl;
}
