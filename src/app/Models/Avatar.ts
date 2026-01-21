import { model, Model } from 'mongoose';
import { AvatarSchema, IAvatar } from '../../database/schemas/AvatarSchema';

const Avatar: Model<IAvatar> = model<IAvatar>('Avatar', AvatarSchema);

export { Avatar };

