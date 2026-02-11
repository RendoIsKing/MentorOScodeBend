import { Router } from "express";
import multer from "multer";
import { Auth } from "../app/Middlewares";
import { addKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/addKnowledgeAction";
import { getKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/getKnowledgeAction";
import { deleteKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/deleteKnowledgeAction";
import { searchKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/searchKnowledgeAction";
import { refineKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/refineKnowledgeAction";
import { confirmKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/confirmKnowledgeAction";
import { reRefineKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/reRefineKnowledgeAction";
import { feedbackChatAction } from "../app/Controllers/Mentors/Knowledge/feedbackChatAction";
import { updateKnowledgeAction } from "../app/Controllers/Mentors/Knowledge/updateKnowledgeAction";

const mentorRoutes: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Existing endpoints (backward compatible)
mentorRoutes.post("/knowledge/add", Auth, upload.single("file"), addKnowledgeAction);
mentorRoutes.get("/knowledge", Auth, getKnowledgeAction);
mentorRoutes.delete("/knowledge/:id", Auth, deleteKnowledgeAction);
mentorRoutes.post("/knowledge/search", Auth, searchKnowledgeAction);

// Smart Ingestion Pipeline endpoints
mentorRoutes.post("/knowledge/refine", Auth, upload.single("file"), refineKnowledgeAction);
mentorRoutes.post("/knowledge/feedback-chat", Auth, feedbackChatAction);
mentorRoutes.post("/knowledge/re-refine", Auth, reRefineKnowledgeAction);
mentorRoutes.post("/knowledge/confirm", Auth, confirmKnowledgeAction);
mentorRoutes.put("/knowledge/:id", Auth, updateKnowledgeAction);

export default mentorRoutes;
