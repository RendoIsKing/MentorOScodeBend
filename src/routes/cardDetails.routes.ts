// import { Express } from "express";
import { Router } from "express";
import { Auth, validateZod } from "../app/Middlewares";
import { CardDetailsController } from "../app/Controllers/CardDetails";
import { z } from "zod";
import { objectIdParam } from "../app/Validation/requestSchemas";

const card: Router = Router();

card.post("/", Auth, validateZod({ body: z.object({}).passthrough() }), CardDetailsController.getCardDetails);
card.get("/", Auth, CardDetailsController.listAllCardsOfUser);
card.post("/:cardId", Auth, validateZod({ params: objectIdParam("cardId"), body: z.object({}).strict() }), CardDetailsController.setDefaultCard);
card.delete("/:cardId", Auth, validateZod({ params: objectIdParam("cardId"), body: z.object({}).strict() }), CardDetailsController.deleteCard);

export default card;
