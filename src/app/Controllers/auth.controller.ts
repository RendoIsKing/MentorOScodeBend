import { Request, Response } from "express";
import { validate } from "class-validator";
import passport from "passport";
import { genSaltSync, hashSync, compareSync } from "bcryptjs";
import { compareAsc } from "date-fns";

import { ValidationErrorResponse } from "../../types/ValidationErrorResponse";
import { RegisterInput } from "../Inputs/Register.input";
import { User } from "../Models/User";
import { Subscription } from "../Models/Subscription";

import { UserInterface } from "../../types/UserInterface";

import { LoginInput } from "../Inputs/Login.input";
import { generateAuthToken } from "../../utils/jwt";
import { RolesEnum } from "../../types/RolesEnum";
import { CheckUserInput } from "../Inputs/checkUser.input";
// import { UserLoginDto } from "../Inputs/UserLogin.input";
import { plainToClass } from "class-transformer";
import { addMinutes } from "date-fns";
import otpGenerator from "../../utils/otpGenerator";
import { OTPInput } from "../Inputs/OTPInput";
// import { Collection } from "../Models/Collection";
// import { SubscriptionPlan } from "../Models/SubscriptionPlan";
import { UpdateUserDTO } from "../Inputs/UpdateUser.input";

import { UserForgotPasswordDto } from "../Inputs/UserForgotPassword.input";
import mongoose from "mongoose";
// import jwt from "jsonwebtoken";
import { SubscriptionPlanType } from "../../types/enums/subscriptionPlanEnum";
import { InteractionType } from "../../types/enums/InteractionTypeEnum";
import { PostType } from "../../types/enums/postTypeEnum";
import { SubscriptionStatusEnum } from "../../types/enums/SubscriptionStatusEnum";
import { sendMessage } from "../../utils/Twillio/sendMessage";

class AuthController {
  // NOTE: legacy misspelling kept for backward compatibility with any callers
  static regsiter = async (req: Request, res: Response): Promise<any> => {
    const input = req.body;

    const registerInput = new RegisterInput();

    registerInput.firstName = input.firstName;
    registerInput.lastName = input.lastName;
    registerInput.email = input.email;
    registerInput.phoneNumber = input.phoneNumber;
    registerInput.password = input.password;
    registerInput.dialCode = input.dialCode;
    registerInput.country = input.country;
    const errors = await validate(registerInput);

    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res
        .status(400)
        .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
    }
    try {
      // const user = await User.findOne({phoneNumber: input.phoneNumber,email : input.email});
      const user = await User.findOne({
        $or: [
          { email: input.email },
          {
            completePhoneNumber: `${input.country}--${input.dialCode}--${input.phoneNumber}`,
          },
        ],
      });
      if (!user) {
        const salt = genSaltSync(10);
        const hashPassword = hashSync(input.password, salt);

        await User.create({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          password: hashPassword,
          role: RolesEnum.USER,
          phoneNumber: input.phoneNumber,
          country: input.country,
          dialCode: input.dialCode,
          completePhoneNumber: `${input.country}--${input.dialCode}--${input.phoneNumber}`,
          isActive: true, //need to delete
          isVerified: true, //need to delete
        });

        passport.authenticate(
          "local",
          { session: false },
          (err: any, user: UserInterface, message: Object) => {
            if (!user) {
              if (err) {
                return res.status(400).json({ error: err });
              }
              return res.status(401).json({ error: message });
            } else if (!user.isActive) {
              return res
                .status(401)
                .json({ error: "User not active.Please contact admin." });
            } else if (!user.isVerified) {
              return res.status(401).json({
                error: "User not verified.Please verify your account",
              });
            } else if (user.isDeleted) {
              return res
                .status(401)
                .json({ error: "User is deleted.Please contact admin" });
            }
            const token = generateAuthToken(user);
            res.cookie('auth_token', token, { httpOnly: false, sameSite: 'lax', secure: false, maxAge: 1000*60*60*24*30, path: '/' });
            return res.json({
              data: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin,
                image: user.photoId,
                phoneNumber: user.phoneNumber,
                country: user.country,
                dialCode: user.dialCode,
                token,
              },
            });
          }
        )(req, res);
      } else {
        return res.status(400).json({
          data: {
            message: "User already exists with same email or phone number.",
          },
        });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static login = async (req: Request, res: Response): Promise<Response> => {
    const input = req.body;
    const loginInput = new LoginInput();
    loginInput.email = input.email;
    loginInput.password = input.password;
    const errors = await validate(loginInput);

    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res.status(400).json({
        error: { message: "VALIDATIONS_ERROR", info: { errorsInfo } },
      });
    }
    return passport.authenticate(
      "local",
      { session: false },
      (err: any, user: UserInterface, message: Object) => {
        if (!user) {
          if (err) {
            return res.status(400).json({ error: err });
          }
          return res.status(401).json({ error: message });
        } else if (!user.isActive) {
          return res
            .status(401)
            .json({ error: "User not active.Please contact admin." });
        } else if (!user.isVerified) {
          return res
            .status(401)
            .json({ error: "User not verified.Please verify your account" });
        } else if (user.isDeleted) {
          return res
            .status(401)
            .json({ error: "User is deleted.Please contact admin" });
        }
        const token = generateAuthToken(user);
        res.cookie('auth_token', token, { httpOnly: false, sameSite: 'lax', secure: false, maxAge: 1000*60*60*24*30, path: '/' });
        return res.json({
          data: {
            _id: user._id,
            firstName: user?.firstName,
            lastName: user?.lastName,
            email: user?.email,
            role: user?.role,
            lastLogin: user?.lastLogin,
            image: user?.photoId,
            phoneNumber: user?.phoneNumber,
            country: user?.country,
            dialCode: user?.dialCode,
            token,
          },
        });
      }
    )(req, res);
  };

  static updateMe = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = req.user as UserInterface;
      const updateData = plainToClass(UpdateUserDTO, req.body);

      const errors = await validate(updateData);
      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      if (updateData.password) {
        const salt = genSaltSync(10);
        updateData.password = hashSync(updateData.password, salt);
        // Do not log sensitive data
      }
      const updatedUser = await User.findByIdAndUpdate(user.id, updateData, {
        new: true,
      });

      if (updatedUser?.photoId) {
        updatedUser.hasPhotoInfo = true;
        await updatedUser.save();
      }

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        data: updatedUser,
        message: "User updated successfully",
      });
    } catch (error) {
      console.error("Error in user Updation", error);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };

  static userLogin = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, username, phoneNumber, password, dialCode } = req.body;

      // Branch A: Phone-only initiation (no password) → generate OTP (signup/OTP login flow)
      if (!password && (phoneNumber || email || username)) {
        // Normalize phone from either "dial--num", "country--dial--num", or separate dialCode/phoneNumber
        let dial = '';
        let num = '';
        if (typeof phoneNumber === 'string' && phoneNumber.includes('--')) {
          const parts = phoneNumber.split('--');
          if (parts.length === 2) {
            dial = String(parts[0] || '').replace(/^\+/, '').replace(/\s+/g, '');
            num = String(parts[1] || '').replace(/\s+/g, '');
          } else if (parts.length === 3) {
            dial = String(parts[1] || '').replace(/^\+/, '').replace(/\s+/g, '');
            num = String(parts[2] || '').replace(/\s+/g, '');
          }
        } else if (phoneNumber && dialCode) {
          dial = String(dialCode || '').replace(/^\+/, '').replace(/\s+/g, '');
          num = String(phoneNumber || '').replace(/\s+/g, '');
        }

        if (dial && num) {
          // Find or create user by phone
          const threePartRegex = new RegExp(`^[A-Za-z]{2}--${dial.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}--${num.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, 'i');
          let user = await User.findOne({
            isDeleted: false,
            $or: [
              { completePhoneNumber: `${dial}--${num}` },
              { completePhoneNumber: { $regex: threePartRegex } },
              { $and: [{ dialCode: dial }, { phoneNumber: num }] },
            ],
          });

          if (!user) {
            user = await User.create({
              firstName: '',
              lastName: '',
              email: email || undefined,
              dialCode: dial,
              phoneNumber: num,
              role: RolesEnum.USER,
              isActive: true,
              isVerified: false,
            } as any);
          }

          const otp = otpGenerator();
          const otpInvalidAt = addMinutes(new Date(), 10);
          user.otp = String(otp);
          // @ts-ignore
          user.otpInvalidAt = otpInvalidAt;
          await user.save();

          // Send OTP (dev: also return it in response for easy verification)
          try {
            await sendMessage(`${dial}--${num}`, `Your OTP is: ${otp}`);
          } catch (e) {
            // ignore SMS errors in dev
          }

          return res.status(200).json({
            data: { _id: user._id, dialCode: dial, phoneNumber: num, otp },
            message: 'OTP sent successfully',
          });
        }
      }

      // Accept both formats: "<dialCode>--<number>" and "<country>--<dialCode>--<number>"
      const orClauses: any[] = [];
      if (email) orClauses.push({ email });
      if (username) orClauses.push({ userName: username });

      if (typeof phoneNumber === "string" && phoneNumber.includes("--")) {
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
        const parts = phoneNumber.split("--");
        if (parts.length === 2) {
          const [rawDial, rawNum] = parts;
          const dial = String(rawDial || "").replace(/^\+/, "").replace(/\s+/g, "");
          const num = String(rawNum || "").replace(/\s+/g, "");
          // Try exact two-part match and a regex that matches stored three-part format
          orClauses.push({ completePhoneNumber: `${dial}--${num}` });
          orClauses.push({
            completePhoneNumber: {
              $regex: new RegExp(`^[A-Za-z]{2}--${esc(dial)}--${esc(num)}$`, "i"),
            },
          });
          // Also allow direct match on separate fields
          orClauses.push({ $and: [{ dialCode: dial }, { phoneNumber: num }] });
        } else {
          // Already three-part; try exact match
          const [, rawDial3, rawNum3] = parts as any;
          const dial3 = String(rawDial3 || "").replace(/^\+/, "").replace(/\s+/g, "");
          const num3 = String(rawNum3 || "").replace(/\s+/g, "");
          orClauses.push({ completePhoneNumber: `${dial3}--${num3}` });
          orClauses.push({ $and: [{ dialCode: dial3 }, { phoneNumber: num3 }] });
        }
      }

      const user = await User.findOne({
        ...(orClauses.length ? { $or: orClauses } : {}),
        isDeleted: false,
      });

      if (!user || !user.password || !compareSync(password, user.password)) {
        return res.status(400).json({ message: "Invalid login credentials" });
      }

      // @ts-ignore
      req.session.user = {
        id: user._id,
        email: user.email,
        role: user.role,
      };

      const token = generateAuthToken(user as unknown as UserInterface);
      // Set cookie to support endpoints that read from cookies (student/interaction routes)
      res.cookie('auth_token', token, { httpOnly: false, sameSite: 'lax', secure: false, maxAge: 1000*60*60*24*30, path: '/' });

      return res.json({
        message: "User login successfully",
        token,
        user: {
          id: user._id,
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
          email: user.email,
          role: user.role,
          userName: user.userName,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Something went wrong" });
    }
  };

  static checkUser = async (req: Request, res: Response): Promise<Response> => {
    const input = req.body;
    const userInput = new CheckUserInput();
    // userInput.phoneNumber = input.phoneNumber;
    // userInput.email = input.email;

    userInput.email = input.email;
    userInput.phoneNumber = input.phoneNumber;
    userInput.dialCode = input.dialCode;
    userInput.country = input.country;

    const errors = await validate(userInput);

    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res.status(400).json({
        error: { message: "VALIDATIONS_ERROR", info: { errorsInfo } },
      });
    }
    const user = await User.findOne({
      $or: [
        { email: input.email },
        {
          completePhoneNumber: `${input.country}--${input.dialCode}--${input.phoneNumber}`,
        },
      ],
    });
    // const user = await User.findOne({phoneNumber: input.phoneNumber,email : input.email});
    if (user) {
      return res.json({ data: { message: "User exist." } });
    } else {
      return res
        .status(400)
        .json({ data: { message: "User does not exist." } });
    }
  };

  static verifyOtp = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id, otp } = req.body;
      const otpInput = new OTPInput();

      otpInput.id = id;
      otpInput.otp = otp;

      const errors = await validate(otpInput);

      if (errors.length) {
        const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
          property: error.property,
          constraints: error.constraints,
        }));

        return res
          .status(400)
          .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
      }

      const objectId = otpInput.id;

      const user = await User.findById(objectId);
      if (!user) {
        return res.status(400).json({ error: { message: "User not found" } });
      }

      //   if (user?.isVerified) {
      //     return res
      //       .status(400)
      //       .json({ error: { message: "User already verified" } });
      //   }
      if (user.otp != otp || compareAsc(new Date(), user.otpInvalidAt) === 1) {
        return res.status(400).json({ data: { message: "otp is invalid" } });
      }

      const updatedUser = (await User.findByIdAndUpdate(
        objectId,
        { isVerified: true, verifiedAt: new Date(), otp: "" },
        { new: true }
      )) as UserInterface;

      const token = await generateAuthToken(updatedUser);

      return res.json({
        data: {
          ...updatedUser.toObject(),
          token,
        },
        message: "User verified succesfully",
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong" } });
    }
  };

  static me = async (req: Request, res: Response): Promise<Response> => {
    const user = req.user as UserInterface | undefined;
    try {
      if (!user?.id) {
        return res.status(401).json({ error: { message: "Unauthorized" } });
      }
      const userId = new mongoose.Types.ObjectId(user.id);

      const [result] = await User.aggregate([
        { $match: { _id: userId } },
        {
          $lookup: {
            from: "files",
            localField: "photoId",
            foreignField: "_id",
            as: "photo",
          },
        },
        {
          $addFields: {
            photo: {
              $cond: {
                if: { $eq: [{ $size: "$photo" }, 0] },
                then: null,
                else: { $arrayElemAt: ["$photo", 0] },
              },
            },
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "coverPhotoId",
            foreignField: "_id",
            as: "coverPhoto",
          },
        },
        {
          $addFields: {
            coverPhoto: {
              $cond: {
                if: { $eq: [{ $size: "$coverPhoto" }, 0] },
                then: null,
                else: { $arrayElemAt: ["$coverPhoto", 0] },
              },
            },
          },
        },
        {
          $lookup: {
            from: "subscriptionplans",
            localField: "_id",
            foreignField: "userId",
            as: "subscriptionPlans",
          },
        },
        {
          $addFields: {
            subscriptionPlans: {
              $filter: {
                input: "$subscriptionPlans",
                as: "plan",
                cond: {
                  $and: [
                    { $eq: ["$$plan.isDeleted", false] },
                    {
                      $or: [
                        {
                          $eq: ["$$plan.planType", SubscriptionPlanType.CUSTOM],
                        },
                        {
                          $eq: ["$$plan.planType", SubscriptionPlanType.FIXED],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $facet: {
            user: [{ $limit: 1 }],
            followersCount: [
              {
                $lookup: {
                  from: "userconnections",
                  let: { userId: "$_id" },
                  pipeline: [
                    {
                      $match: { $expr: { $eq: ["$followingTo", "$$userId"] } },
                    },
                    { $count: "count" },
                  ],
                  as: "followers",
                },
              },
              {
                $addFields: {
                  count: { $arrayElemAt: ["$followers.count", 0] },
                },
              },
            ],
            followingCount: [
              {
                $lookup: {
                  from: "userconnections",
                  let: { userId: "$_id" },
                  pipeline: [
                    { $match: { $expr: { $eq: ["$owner", "$$userId"] } } },
                    { $count: "count" },
                  ],
                  as: "following",
                },
              },
              {
                $addFields: {
                  count: { $arrayElemAt: ["$following.count", 0] },
                },
              },
            ],
            postsCount: [
              {
                $lookup: {
                  from: "posts",
                  let: { userId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$user", "$$userId"] },
                            { $eq: ["$isDeleted", false] },
                            { $eq: ["$type", PostType.POST] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "posts",
                },
              },
              {
                $addFields: {
                  count: { $arrayElemAt: ["$posts.count", 0] },
                },
              },
            ],
            likesCount: [
              {
                $lookup: {
                  from: "posts",
                  let: { userId: "$_id" },
                  pipeline: [
                    { $match: { $expr: { $eq: ["$user", "$$userId"] } } },
                    { $project: { _id: 1 } },
                  ],
                  as: "userPosts",
                },
              },
              { $unwind: "$userPosts" },
              {
                $lookup: {
                  from: "interactions",
                  let: { postId: "$userPosts._id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$post", "$$postId"] },
                            { $eq: ["$type", InteractionType.LIKE_POST] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "likes",
                },
              },
              {
                $group: {
                  _id: null,
                  totalLikes: { $sum: { $arrayElemAt: ["$likes.count", 0] } },
                },
              },
              {
                $addFields: {
                  totalLikes: { $ifNull: ["$totalLikes", 0] },
                },
              },
            ],
            subscriberCount: [
              {
                $lookup: {
                  from: "subscriptions",
                  let: { planIds: "$subscriptionPlans._id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $in: ["$planId", "$$planIds"] },
                            { $eq: ["$status", SubscriptionStatusEnum.ACTIVE] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "subscribers",
                },
              },
              {
                $addFields: {
                  count: { $arrayElemAt: ["$subscribers.count", 0] },
                },
              },
            ],
          },
        },
        {
          $project: {
            user: { $arrayElemAt: ["$user", 0] },
            followersCount: {
              $ifNull: [{ $arrayElemAt: ["$followersCount.count", 0] }, 0],
            },
            followingCount: {
              $ifNull: [{ $arrayElemAt: ["$followingCount.count", 0] }, 0],
            },
            postsCount: {
              $ifNull: [{ $arrayElemAt: ["$postsCount.count", 0] }, 0],
            },
            totalLikes: {
              $ifNull: [{ $arrayElemAt: ["$likesCount.totalLikes", 0] }, 0],
            },
            subscriberCount: {
              $ifNull: [{ $arrayElemAt: ["$subscriberCount.count", 0] }, 0],
            },
          },
        },
      ]);

      // get the user platform subscription
      console.log("Existing user id is", user.id);
      let planId = "67648382f267d99e0dc8de11";

      if (user?.isFreeSubscription) {
        planId = "678a0764e01be7cfa52b9a9c";
      }
      const subscriptionDetails = await Subscription.findOne({
        userId: user.id,
        planId: planId, //same $20 plan used for all users.
      }).select("-stripeSubscriptionObject");

      if (result && result.user) {
        return res.json({
          data: {
            ...result.user,
            followersCount: result.followersCount,
            followingCount: result.followingCount,
            postsCount: result.postsCount,
            totalLikes: result.totalLikes,
            subscriberCount: result.subscriberCount,
            platformSubscription: subscriptionDetails,
          },
        });
      }

      return res.status(404).json({ error: { message: "User not found." } });
    } catch (err) {
      console.error(err, "error in retrievng user");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  //Below forget password apis
  static sendForgotPasswordOtp = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // Validate input using DTO
      const userInput = plainToClass(UserForgotPasswordDto, req.body);
      const errors = await validate(userInput);

      if (errors.length) {
        const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
          property: error.property,
          constraints: error.constraints,
        }));

        return res
          .status(400)
          .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
      }

      // Check if the user exists
      // Support both two-part and three-part stored formats
      const dial = String(userInput.dialCode || '');
      const num = String(userInput.phoneNumber || '');
      const threePartRegex = new RegExp(`^[A-Za-z]{2}--${dial.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}--${num.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, 'i');
      const user = await User.findOne({
        isDeleted: false,
        $or: [
          { completePhoneNumber: `${dial}--${num}` },
          { completePhoneNumber: { $regex: threePartRegex } },
        ],
      });
      console.log("Reached");
      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found with this phone number",
        });
      }

      // Generate OTP and update user
      const otp = otpGenerator();
      const otpInvalidAt = addMinutes(new Date(), 10);

      const updatedData = {
        otp,
        otpInvalidAt,
      };

      await User.findByIdAndUpdate(user.id, updatedData, { new: true });

      // Send OTP via SMS
      await sendMessage(
        `${dial}--${num}`,
        `Your OTP for password reset is: ${otp}`
      );

      return res.status(200).json({
        status: true,
        message: "OTP sent successfully. Please verify within 10 minutes.",
        otp,
      });
    } catch (error) {
      console.error("Error in sending OTP:", error);
      return res.status(500).json({
        status: false,
        message: "Failed to send OTP.",
      });
    }
  };

  static validateForgotPasswordOtp = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { dialCode, phoneNumber, otp } = req.body;

      if (!dialCode || !phoneNumber || !otp) {
        return res.status(400).json({
          status: false,
          message: "Phone number, dial code, and OTP are required.",
        });
      }

      const threePartRegex = new RegExp(`^[A-Za-z]{2}--${String(dialCode || '').replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}--${String(phoneNumber || '').replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, 'i');
      const user = await User.findOne({
        isDeleted: false,
        $or: [
          { completePhoneNumber: `${dialCode}--${phoneNumber}` },
          { completePhoneNumber: { $regex: threePartRegex } },
        ],
      });

      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found with this phone number.",
        });
      }

      console.log("user details are", user);

      if (!user.otp || user.otp !== otp.toString()) {
        return res.status(400).json({
          status: false,
          message: "Invalid OTP.",
        });
      }

      if (new Date() > user.otpInvalidAt) {
        return res.status(400).json({
          status: false,
          message: "OTP has expired.",
        });
      }

      // const usreInfo = await User.findOneAndUpdate(
      //   {completePhoneNumber: completePhoneNumber},
      //   {otp: ""},
      //  {new: true}
      // );

      return res.status(200).json({
        status: true,
        message: "OTP validated successfully.",
        user: user,
        // user: usreInfo
      });
    } catch (error) {
      console.error("Error in validating OTP:", error);
      return res.status(500).json({
        status: false,
        message: "Failed to validate OTP.",
        error: error.message,
      });
    }
  };

  static resetPassword = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { dialCode, phoneNumber, newPassword, confirmPassword } = req.body;

      // Validate required fields
      if (!dialCode || !phoneNumber || !newPassword || !confirmPassword) {
        return res.status(400).json({
          message:
            "Dial code, phone number, new password, and confirm password are required.",
        });
      }

      // Check if passwords match
      if (newPassword !== confirmPassword) {
        return res
          .status(400)
          .json({ message: "New password and confirm password do not match." });
      }

      const threePartRegex = new RegExp(`^[A-Za-z]{2}--${String(dialCode || '').replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}--${String(phoneNumber || '').replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, 'i');
      const user = await User.findOne({
        isDeleted: false,
        $or: [
          { completePhoneNumber: `${dialCode}--${phoneNumber}` },
          { completePhoneNumber: { $regex: threePartRegex } },
        ],
      });

      // Check if the user exists
      if (!user) {
        return res
          .status(404)
          .json({ message: "User not found with this phone number." });
      }

      const salt = genSaltSync(10);
      const password = newPassword;
      const hashPassword = hashSync(password, salt);
      await User.findOneAndUpdate(
        { _id: user._id, isDeleted: false },
        {
          password: hashPassword,
        },
        {
          new: true,
        }
      );

      return res.status(200).json({ message: "Password reset successfully." });
    } catch (error) {
      console.error("Error in resetting password:", error);
      return res.status(500).json({ message: "Failed to reset password." });
    }
  };
}

export { AuthController };
