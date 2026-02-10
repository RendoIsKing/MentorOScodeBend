import { Request, Response } from "express";
import { User } from "../../../Models/User";
import { generateAccessToken } from "../../../../utils/jwt";
import { UserInterface } from "../../../../types/UserInterface";

export const impersonateUser = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user || user.isDeleted) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    const token = generateAccessToken(user as unknown as UserInterface);

    return res.json({
      data: {
        token,
        user: {
          _id: user._id,
          fullName: user.fullName,
          userName: user.userName,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
