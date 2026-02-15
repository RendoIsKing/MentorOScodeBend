import { Router } from 'express';

import { ProfileController } from '../app/Controllers/';
import { validateZod } from '../app/Middlewares';
import { z } from 'zod';
import { nonEmptyString } from '../app/Validation/requestSchemas';

// import { FileEnum } from "../types/FileEnum";
// import { createMulterInstance } from '../app/Middlewares/fileUpload';

const profile: Router = Router();

// const upload = createMulterInstance(
//     `${process.cwd()}${FileEnum.PUBLICDIR}${FileEnum.PROFILEIMAGE}`
//   );
const changePasswordSchema = z.object({
  currentPassword: nonEmptyString,
  newPassword: nonEmptyString.min(8),
}).strict();

profile.post('/change-password', validateZod({ body: changePasswordSchema }), ProfileController.changePassword);
// profile.post('/update-profile', upload.single('image'), ProfileController.updateProfile);

export default profile;