import { Request, Response } from "express";
import { findMany, insertOne, Tables } from "../../../lib/db";

export class SupportController {
  static getFAQ = async (req: Request, res: Response) => {
    try {
      const faqs = await findMany(Tables.FAQS);

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

      const savedFAQ = await insertOne(Tables.FAQS, {
        topics,
        is_deleted: isDeleted || false,
        deleted_at: deletedAt || null,
      });

      return res.status(201).json(savedFAQ);
    } catch (err) {
      console.error("Error creating FAQ:", err);
      return res.status(500).json({ error: "Failed to create FAQ" });
    }
  };
}
