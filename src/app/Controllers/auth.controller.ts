import { Request, Response } from "express";
import { validate } from "class-validator";
import passport from "passport";
import { genSaltSync, hashSync,compareSync } from "bcryptjs";
import { compareAsc } from "date-fns";

import { ValidationErrorResponse } from "../../types/ValidationErrorResponse";
import { RegisterInput } from "../Inputs/Register.input";
import { User } from "../Models/User";

import { UserInterface } from "../../types/UserInterface";

import { LoginInput } from "../Inputs/Login.input";
import { generateAuthToken } from "../../utils/jwt";
import { RolesEnum } from "../../types/RolesEnum";
import { CheckUserInput } from "../Inputs/checkUser.input";
import { UserLoginDto } from "../Inputs/UserLogin.input";
import { plainToClass } from "class-transformer";
import { addMinutes } from "date-fns";
import otpGenerator from "../../utils/otpGenerator";
import { OTPInput } from "../Inputs/OTPInput";
import { Collection } from "../Models/Collection";
import { SubscriptionPlan } from "../Models/SubscriptionPlan";
import { UpdateUserDTO } from "../Inputs/UpdateUser.input";
import mongoose from "mongoose";
import { SubscriptionPlanType } from "../../types/enums/subscriptionPlanEnum";
import { InteractionType } from "../../types/enums/InteractionTypeEnum";
import { PostType } from "../../types/enums/postTypeEnum";
import { SubscriptionStatusEnum } from "../../types/enums/SubscriptionStatusEnum";

class AuthController {
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

      let phoneNumberExists = await User.findOne({
        isDeleted: false,
        completePhoneNumber: `${updateData.dialCode}--${updateData.phoneNumber}`,
      });

      if (phoneNumberExists) {
        return res.status(404).json({ error: "Phone Number already exists" });
      }

      if(updateData.password){      
      const salt = genSaltSync(10);
      updateData.password= hashSync(updateData.password, salt);
      console.log("updateData.password", updateData.password)
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
    
      const userInput = plainToClass(UserLoginDto, req.body);
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

      if (userInput.phoneNumber && userInput.email) {
        return res.status(400).json({
            status: false,
            message: "Provide either phone number or email, not both" 
          })
        }

      let userExists;
      if(userInput.phoneNumber && userInput.dialCode){
        console.log("user number section running")
        userExists = await User.findOne({
        isDeleted: false,
        completePhoneNumber: `${userInput.dialCode}--${userInput.phoneNumber}`,
      });
    }

    else if(userInput.email){
      console.log("user email section")
        userExists = await User.findOne({
        isDeleted: false,
        email: userInput.email
      });
    }
    else{
      return res.status(400).json({
       status: false,
       message: "Invalid login details"

      })
    }

      if (userExists) {
    
       if( userInput.password && !(await compareSync(userInput.password, userExists.password)))
       {
        return res.status(404).json({
          status: false,
          message: "Password is incorrect",
        });
       }

       const updatedData = {
        otpInvalidAt: addMinutes(new Date(), 10),
        otp: otpGenerator(),
      };

        const user = (await User.findByIdAndUpdate(userExists.id, updatedData, {
          new: true,
        })) as UserInterface;
  
        //From here we can send the otp either email or phoneNumber
        // if(userInput.email){
        //   await sendEmail(userInput.email, updatedData.otp)
        // }
        // else (userInput.phoneNumber){
        //   await sendOtpToPhone(userInput.phoneNumber, updatedData.otp) 
        // }
    
        // user.otp = "";

        return res.json({
          data: user,
          message: "OTP Sent , please verify using it",
        });
      }

      //if user not exist
      const dataToSave = {
        ...userInput,
        otpInvalidAt: addMinutes(new Date(), 10),
        otp: otpGenerator(),
      };

      const user = await User.create(dataToSave);

      const collection = await Collection.create({
        title: "Saved",
        owner: user.id,
      });

      await SubscriptionPlan.create({
        title: "Basic-Free",
        planType: SubscriptionPlanType.BASIC_FREE,
        price: 0,
        userId: user.id,
      });

      await User.findByIdAndUpdate(user.id, {
        primaryCollection: collection.id,
      });

      // user.otp = "";
      return res.json({
        data: user,
        message: "OTP Sent , please verify using it with in 10 minutes",
      });
    } catch (error) {
      console.log(error, "error in user login");
      return res.status(400).json({
        error: { message: "something went wrong" },
      });
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
          ...user.toObject(),
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
    const user = req.user as UserInterface;
    try {
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

      if (result && result.user) {
        return res.json({
          data: {
            ...result.user,
            followersCount: result.followersCount,
            followingCount: result.followingCount,
            postsCount: result.postsCount,
            totalLikes: result.totalLikes,
            subscriberCount: result.subscriberCount,
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
}

export { AuthController };
