import { Router } from "express";
import multer from "multer";
import { Auth } from "../app/Middlewares";
import { addKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/addKnowledgeAction";
import { getKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/getKnowledgeAction";
import { deleteKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/deleteKnowledgeAction";
import { searchKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/searchKnowledgeAction";

const mentorRoutes: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

mentorRoutes.post("/knowledge/add", Auth, upload.single("file"), addKnowledgeAction);
mentorRoutes.get("/knowledge", Auth, getKnowledgeAction);
mentorRoutes.delete("/knowledge/:id", Auth, deleteKnowledgeAction);
mentorRoutes.post("/knowledge/search", Auth, searchKnowledgeAction);

export default mentorRoutes;
