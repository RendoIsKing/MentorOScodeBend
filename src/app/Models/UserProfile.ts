import { model, Model } from 'mongoose';
import { IUserProfile, UserProfileSchema } from '../../database/schemas/UserProfileSchema';

const UserProfile: Model<IUserProfile> = model<IUserProfile>('UserProfile', UserProfileSchema);

export { UserProfile };


