import { Request, Response } from "express";
import { RolesEnum } from "../../../../types/RolesEnum";
import { Document } from "../../../Models/Document";

export const getAllDocuments = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    const LIMIT = 10;

    const perPage =
      _req.query &&
      _req.query.perPage &&
      parseInt(_req.query.perPage as string) > 0
        ? parseInt(_req.query.perPage as string)
        : LIMIT;

    const page =
      _req.query && _req.query.page && parseInt(_req.query.page as string) > 0
        ? parseInt(_req.query.page as string)
        : 1;
    let skip = (page - 1) * perPage;

    let dataToFind: any = {
      role: { $ne: RolesEnum.ADMIN },
      isDeleted: false,
    };
    if (_req.query.search) {
      dataToFind = {
        ...dataToFind,
        $or: [{ title: { $regex: _req.query.search } }],
      };
      skip = 0;
    }
    const [query]: any = await Document.aggregate([
      {
        $facet: {
          results: [
            { $match: dataToFind },
            {
              $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "_id",
                as: "userInfo",
              },
            },
            { $skip: skip },
            { $limit: perPage },
            { $sort: { createdAt: -1 } },
          ],
          documentCount: [{ $match: dataToFind }, { $count: "count" }],
        },
      },
    ]);

    const documentCount = query.documentCount[0]?.count || 0;
    const totalPages = Math.ceil(documentCount / perPage);

    return res.json({
      data: query.results,
      meta: {
        perPage: perPage,
        page: _req.query.page || 1,
        pages: totalPages,
        total: documentCount,
      },
    });
  } catch (err) {
    console.log(err, "Error in getting all documents");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
