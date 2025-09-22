import { Schema, Types } from "mongoose";
import { RolesEnum } from "../../types/RolesEnum";

const UserSchema = new Schema(
  {
    fullName: {
      type: String,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    userName: {
      type: String,
    },
    password: {
      type: String,
      default: null,
    },

    dob: {
      type: String,
    },
    bio: {
      type: String,
    },
    gender: {
      type: String,
    },
    email: {
      type: String,
      // unique: true,
    },
    hasPersonalInfo: {
      type: Boolean,
      default: false,
    },
    hasPhotoInfo: {
      type: Boolean,
      default: false,
    },
    hasSelectedInterest: {
      type: Boolean,
      default: false,
    },
    hasConfirmedAge: {
      type: Boolean,
      default: false,
    },
    hasDocumentUploaded: {
      type: Boolean,
      default: false,
    },
    hasDocumentVerified: {
      type: Boolean,
      default: false,
    },
    location: {
      type: [
        {
          lat: {
            type: Number,
            required: true,
            min: -90,
            max: 90,
          },
          long: {
            type: Number,
            required: true,
            min: -180,
            max: 180,
          },
        },
      ],
      default: [],
    },

    dialCode: {
      type: String,
    },
    phoneNumber: {
      type: String,
      // unique: true,
      default: null,
    },
    photoId: {
      type: Types.ObjectId,
      required: false,
      ref: "File",
    },
    coverPhotoId: {
      type: Types.ObjectId,
      required: false,
      ref: "File",
    },
    interests: [
      {
        type: Types.ObjectId,
        ref: "Interest",
      },
    ],
    primaryCollection: {
      type: Types.ObjectId,
      ref: "Collection",
    },
    isStripeCustomer: {
      type: Boolean,
      default: false,
    },
    stripeClientId: {
      type: String,
      default: null,
    },
    instagramLink: {
      type: String,
      default: null,
    },
    facebookLink: {
      type: String,
      default: null,
    },
    tiktokLink: {
      type: String,
      default: null,
    },
    youtubeLink: {
      type: String,
      default: null,
    },
    stripeProductId: String,
    stripeProduct: {
      type: {},
      required: false,
    },
    role: {
      type: String,
      default: RolesEnum.USER,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: String,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    fcm_token: {
      type: String,
    },
    completePhoneNumber: String,
    otp: {
      type: String,
    },
    isFreeSubscription: {
      type: Boolean,
      default: false,
    },
    otpInvalidAt: Date,
    status: {
      type: String,
      enum: ["VISITOR", "LEAD", "TRIAL", "SUBSCRIBED"],
      default: "VISITOR",
      index: true,
    },
    profileId: {
      type: Types.ObjectId,
      ref: "Profile",
    },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  try {
    const dial = (this as any).dialCode;
    const phone = (this as any).phoneNumber;
    if (dial && phone) {
      (this as any).completePhoneNumber = `${dial}--${phone}`;
    } else {
      // Avoid setting a duplicate placeholder value that could violate a unique index
      (this as any).completePhoneNumber = undefined as any;
    }
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update) {
    const updateDoc = update as { [key: string]: any };
    const dialCode = updateDoc.dialCode ?? updateDoc.$set?.dialCode;
    const phoneNumber = updateDoc.phoneNumber ?? updateDoc.$set?.phoneNumber;
    if (dialCode !== undefined || phoneNumber !== undefined) {
      if (!updateDoc.$set) updateDoc.$set = {};
      if (dialCode && phoneNumber) {
        updateDoc.$set.completePhoneNumber = `${dialCode}--${phoneNumber}`;
      } else {
        // If one is missing, clear the computed field to avoid duplicate placeholders
        updateDoc.$set.completePhoneNumber = undefined;
      }
    }
  }

  next();
});

UserSchema.set("toObject", { virtuals: true });
UserSchema.set("toJSON", { virtuals: true });

UserSchema.virtual("photo", {
  ref: "File",
  localField: "photoId",
  foreignField: "_id",
  justOne: true,
});

export { UserSchema };
