import { Request, Response } from "express";
import { findById, Tables } from "../../../../lib/db";
import { generateAccessToken } from "../../../../utils/jwt";
import { UserInterface } from "../../../../types/UserInterface";

export const impersonateUser = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.params.id;
    const user = await findById(Tables.USERS, userId);

    if (!user || user.is_deleted) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    const token = generateAccessToken(user as unknown as UserInterface);

    return res.json({
      data: {
        token,
        user: {
          _id: user.id,
          fullName: user.full_name,
          userName: user.user_name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
