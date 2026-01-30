import { Request, Response } from "express";
import { Post } from "../../../Models/Post";

export const getAdminPosts = async (req: Request, res: Response): Promise<Response> => {
  try {
    const perPage = Math.max(parseInt(String(req.query.perPage || "10"), 10), 1);
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const skip = (page - 1) * perPage;

    const filter = { isDeleted: false };
    const total = await Post.countDocuments(filter);

    const posts = await Post.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: perPage },
      {
        $lookup: {
          from: "files",
          localField: "media.mediaId",
          foreignField: "_id",
          as: "mediaFiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $addFields: {
          user: { $arrayElemAt: ["$userInfo", 0] },
        },
      },
      {
        $project: {
          userInfo: 0,
        },
      },
    ]);

    const baseUrl = `${req.protocol}://${req.get("host")}/api/backend`;
    const postsWithMedia = posts.map((post: any) => {
      const mediaId = post?.media?.[0]?.mediaId || post?.mediaFiles?.[0]?._id;
      const mediaUrl = mediaId ? `${baseUrl}/v1/user/files/${String(mediaId)}` : null;
      return { ...post, mediaUrl };
    });

    return res.json({
      data: postsWithMedia,
      meta: {
        perPage,
        page,
        pages: Math.ceil(total / perPage),
        total,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};

export const deletePostByAdmin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const post = await Post.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!post) {
      return res.status(404).json({ error: { message: "Post not found." } });
    }
    return res.json({ data: post, message: "Post deleted successfully." });
  } catch (err) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
