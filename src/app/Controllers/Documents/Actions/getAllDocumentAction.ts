import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";

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
    const offset = (page - 1) * perPage;

    let countQuery = db
      .from(Tables.DOCUMENTS)
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false);

    let dataQuery = db
      .from(Tables.DOCUMENTS)
      .select("*, user:users!user_id(id, user_name, full_name, photo_id)")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (_req.query.search) {
      const search = `%${_req.query.search}%`;
      countQuery = countQuery.ilike("title", search);
      dataQuery = dataQuery.ilike("title", search);
    }

    const [{ count: total }, { data: results, error }] = await Promise.all([
      countQuery,
      dataQuery,
    ]);

    if (error) {
      console.log(error, "Error in getting all documents");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    const documentCount = total || 0;
    const totalPages = Math.ceil(documentCount / perPage);

    return res.json({
      data: results || [],
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
