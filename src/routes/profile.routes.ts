import { Router } from 'express';

import { ProfileController } from '../app/Controllers/';

// import { FileEnum } from "../types/FileEnum";
// import { createMulterInstance } from '../app/Middlewares/fileUpload';

const profile: Router = Router();

// const upload = createMulterInstance(
//     `${process.cwd()}${FileEnum.PUBLICDIR}${FileEnum.PROFILEIMAGE}`
//   );
profile.post('/change-password', ProfileController.changePassword);
// profile.post('/update-profile', upload.single('image'), ProfileController.updateProfile);

export default profile;