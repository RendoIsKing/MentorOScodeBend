import {Request, Response} from 'express';
import {validate} from 'class-validator';
import {compareSync, hashSync, genSaltSync} from 'bcryptjs';
import {ChangePasswordInput} from '../Inputs/ChangePassword.input';
import {ValidationErrorResponse} from '../../types/ValidationErrorResponse';
import {User} from '../Models/User';
// import {DeleteFile} from "../../utils/removeFile";
// import {FileEnum} from "../../types/FileEnum";
// import { UpdateUserDTO } from '../Inputs/UpdateUser.input';

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
            const user = await User.findById(id);

            if (!user) {
                return res.status(400).json({error: {message: 'User to update does not exists.'}});
            }

            if (!compareSync(input.currentPassword, user.password)) {
                return res.status(400).json({error: {message: 'Invalid current password'}});
            }

            const salt = genSaltSync(10);
            const password = input.newPassword;
            const hashPassword = hashSync(password, salt);
            await User.findByIdAndUpdate(
                id,
                {
                    password: hashPassword
                },
                {
                    new: true,
                }
            );


            // todo: send password rest mail to user
            return res.json({data: {message: 'Password reset successfully.'}})

        } catch (error) {
            return res.status(500).json({error: {message: 'Something went wrong.'}})
        }
    }
//     static updateProfile = async (req: any, res: Response): Promise<Response> => {
//         const input: UpdateUserDTO = req.body;

//         const {id} = req.user;

//         const updateProfileInput = new UpdateUserDTO();

//   // @ts-ignore
//         delete input.password;
//         const errors = await validate(updateProfileInput);

//         if (errors.length) {
//             const errorsInfo: ValidationErrorResponse[] = errors.map(error => ({
//                 property: error.property,
//                 constraints: error.constraints
//             }));

//             return res.status(400).json({error: {message: 'VALIDATION_ERROR', info: {errorsInfo}}});
//         }

//         try {
//             const user = await User.findById(id);

//             if (!user) {
//                 return res.status(404).json({error: {message: 'User to update does not exists.'}});
//             }

//             await User.findByIdAndUpdate(
//                 id,
//                 {
//                     firstName: input.firstName ? input.firstName : user.firstName,
//                     lastName: input.lastName ? input.lastName : user.lastName,
//                     email: input.email ? input.email : user.email,
//                     phoneNumber: input.phoneNumber ? input.phoneNumber : user.phoneNumber,
//                     image: (req.file || {}).filename ? `${FileEnum.PROFILEIMAGE}${req.file.filename}` : user.photoId,
//                 },
//                 {
//                     new: true,
//                 }
//             );
//             const updatedUser = await User.findById(
//                 id,
//                 '-password -__v'
//             )
//             if (req.file && user.photoId) {
//                 DeleteFile(`${user.photoId}`);
//             }
//             // todo: send password rest mail to user
//             return res.json({data: {message: 'Profile updated successfully.', data: updatedUser}})

//         } catch (error) {
//             return res.status(500).json({error: {message: 'Something went wrong.'}})
//         }
//     }
}
