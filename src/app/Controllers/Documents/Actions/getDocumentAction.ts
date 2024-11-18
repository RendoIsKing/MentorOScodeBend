import { Request, Response } from "express";
import { Document } from "../../../Models/Document";

export const getDocumentById = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  try {
    const document = await Document.findById({ _id: id });

    if (document) {
      return res.json({ data: document });
    }

    return res.status(404).json({ error: { message: "Document not found." } });
  } catch (err) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
