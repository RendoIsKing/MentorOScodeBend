import {Request, Response} from 'express';
import {validate} from 'class-validator';
import {compareSync, hashSync, genSaltSync} from 'bcryptjs';
import {ChangePasswordInput} from '../Inputs/ChangePassword.input';
import {ValidationErrorResponse} from '../../types/ValidationErrorResponse';
import { findById, updateById, Tables } from '../../lib/db';

export class ProfileController {
    static changePassword = async (req: Request, res: Response): Promise<Response> => {
        const input: ChangePasswordInput = req.body;
  // @ts-ignore
        const {id} = req.user;

        const changePasswordInput = new ChangePasswordInput();

        changePasswordInput.currentPassword = input.currentPassword;
        changePasswordInput.newPassword = input.newPassword;

        const errors = await validate(changePasswordInput);

        if (errors.length) {
            const errorsInfo: ValidationErrorResponse[] = errors.map(error => ({
                property: error.property,
                constraints: error.constraints
            }));

            return res.status(400).json({error: {message: 'VALIDATION_ERROR', info: {errorsInfo}}});
        }

        try {
            const user = await findById(Tables.USERS, id);

            if (!user) {
                return res.status(400).json({error: {message: 'User to update does not exists.'}});
            }

            if (!compareSync(input.currentPassword, user.password)) {
                return res.status(400).json({error: {message: 'Invalid current password'}});
            }

            const salt = genSaltSync(10);
            const password = input.newPassword;
            const hashPassword = hashSync(password, salt);
            await updateById(
                Tables.USERS,
                id,
                { password: hashPassword }
            );

            // todo: send password rest mail to user
            return res.json({data: {message: 'Password reset successfully.'}})

        } catch (error) {
            return res.status(500).json({error: {message: 'Something went wrong.'}})
        }
    }
}
