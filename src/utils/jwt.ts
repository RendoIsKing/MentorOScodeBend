import {sign} from 'jsonwebtoken';

import {UserInterface} from '../types/UserInterface';

export function generateToken(data: any): string {
    return sign(data, process.env.APP_SECRET as string);
}

export function generateAuthToken(user: UserInterface): string {
    const data = {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        isActive: user.isActive,
        isVerified: user.isVerified,
        isDeleted: user.isDeleted,
        date:new Date()
    };

    return generateToken(data);
}
