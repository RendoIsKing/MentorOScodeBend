// import { Express } from "express";
import { Router } from "express";
import { Auth } from "../app/Middlewares";
import { CardDetailsController } from "../app/Controllers/CardDetails";

const card: Router = Router();

card.post("/", Auth, CardDetailsController.getCardDetails);
card.get("/", Auth, CardDetailsController.listAllCardsOfUser);
card.post("/:cardId", Auth, CardDetailsController.setDefaultCard);
card.delete("/:cardId", Auth, CardDetailsController.deleteCard);

export default card;
