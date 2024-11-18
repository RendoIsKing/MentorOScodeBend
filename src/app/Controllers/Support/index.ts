import { Request, Response } from "express";
import { FAQ } from "../../Models/FAQ";

export class SupportController {
  static getFAQ = async (req: Request, res: Response) => {
    try {
      const faqs = await FAQ.find().exec();

      return res.status(200).json(faqs);
    } catch (err) {
      console.error("Error fetching FAQs:", err);
      return res.status(500).json({ error: "Failed to fetch FAQs" });
    }
  };

  static createFAQ = async (req: Request, res: Response) => {
    try {
      const { topics, isDeleted, deletedAt } = req.body;

      if (!topics) {
        return res.status(400).json({ error: "Topics array is required" });
      }

      const newFAQ = new FAQ({
        topics,
        isDeleted: isDeleted || false,
        deletedAt: deletedAt || null,
      });

      const savedFAQ = await newFAQ.save();

      return res.status(201).json(savedFAQ);
    } catch (err) {
      console.error("Error creating FAQ:", err);
      return res.status(500).json({ error: "Failed to create FAQ" });
    }
  };
}
