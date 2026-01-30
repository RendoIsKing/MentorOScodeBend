import { Router } from "express";
import { Auth, OnlyAdmins, validateZod } from "../app/Middlewares";
import { DocumentController } from "../app/Controllers/Documents";
import { z } from "zod";
import { objectIdParam } from "../app/Validation/requestSchemas";

const document: Router = Router();
document.get("/:id", Auth, DocumentController.getDocumentById);

document.post("/verify/:id", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), DocumentController.verifyDocument);
document.post("/reject/:id", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), DocumentController.rejectDocument);
document.post("/", Auth, validateZod({ body: z.object({}).passthrough() }), DocumentController.postDocument);
document.get("/", OnlyAdmins, DocumentController.getAllDocuments);

export default document;
