import { IsString, Length } from 'class-validator';

export class ChangePasswordInput {
    @IsString({ message: 'Current Password should not be empty.' })
        // @ts-ignore
    currentPassword: string;

    @IsString({ message: 'New Password should not be empty' })
    @Length(6)
        // @ts-ignore
    newPassword: string;
}
