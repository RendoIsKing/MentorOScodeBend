import { Router } from "express";
import { Auth, OnlyAdmins } from "../app/Middlewares";
import { DocumentController } from "../app/Controllers/Documents";

const document: Router = Router();
document.get("/:id", Auth, DocumentController.getDocumentById);

document.post("/verify/:id", OnlyAdmins, DocumentController.verifyDocument);
document.post("/", Auth, DocumentController.postDocument);
document.get("/", OnlyAdmins, DocumentController.getAllDocuments);

export default document;
