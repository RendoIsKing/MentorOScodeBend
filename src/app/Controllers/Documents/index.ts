import { Request, Response } from "express";
import { verifyDocument } from "./Actions/verifyDocumentAction";
import { postDocument } from "./Actions/postDocumentAction";
import { getDocumentById } from "./Actions/getDocumentAction";
import { getAllDocuments } from "./Actions/getAllDocumentAction";


export class DocumentController {
  static verifyDocument = async (req: Request, res: Response) => {
    return verifyDocument(req, res);
  };


  static postDocument = (req: Request, res: Response) => {
    return postDocument(req, res);
  };

  static getDocumentById = (req: Request, res: Response) => {
    return getDocumentById(req, res);
  };

  static getAllDocuments = (req: Request,  res: Response) => {
    return getAllDocuments(req, res);
  };




}
