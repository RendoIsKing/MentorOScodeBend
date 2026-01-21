import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

type SchemaConfig = {
  params?: ZodSchema<any>;
  query?: ZodSchema<any>;
  body?: ZodSchema<any>;
};

export function validateZod(schemas: SchemaConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (schemas.params) {
      const parsed = schemas.params.safeParse(req.params);
      if (!parsed.success) {
        return res.status(422).json({ error: "validation_failed", details: parsed.error.flatten() });
      }
      req.params = parsed.data;
    }
    if (schemas.query) {
      const parsed = schemas.query.safeParse(req.query);
      if (!parsed.success) {
        return res.status(422).json({ error: "validation_failed", details: parsed.error.flatten() });
      }
      req.query = parsed.data;
    }
    if (schemas.body) {
      const parsed = schemas.body.safeParse(req.body);
      if (!parsed.success) {
        return res.status(422).json({ error: "validation_failed", details: parsed.error.flatten() });
      }
      req.body = parsed.data;
    }
    return next();
  };
}
