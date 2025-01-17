import { Document, Types } from "mongoose";

import { RolesEnum } from "./RolesEnum";
import { ICollection } from "./interfaces/CollectionInterface";
import { FileInterface } from "./FileInterface";

export interface UserInterface extends Document {
  firstName: string;
  lastName: string;
  fullName: string;
  userName: string;
  phoneNumber: string;
  email: string;
  password: string;
  role: RolesEnum;
  lastLogin: Date;
  photoId: Types.ObjectId | FileInterface;
  coverPhotoId: Types.ObjectId | FileInterface;
  country: string;
  dialCode: string;
  instagramLink: string;
  facebookLink: string;
  tiktokLink: string;
  youtubeLink: string;
  isVerified: boolean;
  verifiedAt: Date;
  hasPersonalInfo?: boolean;
  hasPhotoInfo?: boolean;
  hasConfirmedAge?: boolean;
  stripeProductId: string;
  stripeProduct: {} | any;
  hasSelectedInterest?: boolean;
  hasDocumentUploaded?: boolean;
  hasDocumentVerified?: boolean;
  interests: Types.ObjectId[];
  isStripeCustomer: string;
  stripeClientId: string;
  fcm_token: string;
  isActive: boolean;
  activatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date;
  otp: string;
  otpInvalidAt: Date;
  isFreeSubscription: Boolean;
  primaryCollection: Types.ObjectId | ICollection;
}
