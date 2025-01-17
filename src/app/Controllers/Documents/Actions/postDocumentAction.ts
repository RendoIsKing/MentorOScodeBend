import { Request, Response } from "express";
import { Document } from "../../../Models/Document";
import { validate } from "class-validator";
import { DocumentInput } from "../Inputs/postDocumentInput";
import { UserInterface } from "../../../../types/UserInterface";
import { User } from "../../../Models/User";
import { plainToClass } from "class-transformer";

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
      await User.findByIdAndUpdate(user.id, {
        hasDocumentUploaded: true,
      });
    }

    const newDocument = new Document({
      ...req.body,
      userId: user.id,
    });

    await newDocument.save();

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
