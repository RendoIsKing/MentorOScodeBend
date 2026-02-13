import { Request, Response } from "express";
import { validate } from "class-validator";
import { DocumentInput } from "../Inputs/postDocumentInput";
import { UserInterface } from "../../../../types/UserInterface";
import { plainToClass } from "class-transformer";
import { insertOne, updateById, Tables } from "../../../../lib/db";

export const postDocument = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const docInput = plainToClass(DocumentInput, req.body);
    const validationErrors = await validate(docInput);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    const user = req.user as UserInterface;
    if (user) {
      await updateById(Tables.USERS, user.id || '', {
        has_document_uploaded: true,
      });
    }

    const newDocument = await insertOne(Tables.DOCUMENTS, {
      title: req.body.title || '',
      description: req.body.description || '',
      document_media_id: req.body.documentMediaId,
      type: req.body.type,
      user_id: user.id || '',
    });

    return res.json({
      data: newDocument,
      message: "Document created successfully.",
    });
  } catch (err) {
    console.error(err, "Error in posting document");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
