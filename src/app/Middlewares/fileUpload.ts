import multer from "multer";
import { Request } from "express";

interface FileInterface {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
}

const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/mpeg",
  "video/x-msvideo",
  "video/quicktime"
];

export function createMulterInstance(path: string) {
  const storage = multer.diskStorage({
    destination: function (req: Request, file: FileInterface, cb: Function) {
      cb(null, path);
    },
    filename: function (req: Request, file: FileInterface, cb: Function) {
      const fileExtension = file.originalname.split(".").pop();
      cb(
        null,
        `${file.fieldname}-${Date.now()}.${fileExtension}`
      );
    },
  });

  const fileFilter = (req: Request, file: FileInterface, cb: Function) => {
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"), false);
    }
  };

  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 1024 * 1024 * 50
    }
  });
}