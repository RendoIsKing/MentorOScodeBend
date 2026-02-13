import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { findById, updateById, Tables } from '../../lib/db';

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/profile-pictures/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Append extension
  },
});

const upload = multer({ storage });

export const updateProfilePicture = [
  // Multer middleware for file handling
  upload.single('profilePicture'),

  // Controller logic
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;

      const user = await findById(Tables.USERS, userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if(req.file) {
        const profilePictureUrl = `/uploads/profile-pictures/${req.file.filename}`;
        await updateById(Tables.USERS, userId, {
          profile_picture_url: profilePictureUrl,
        });

        return res.json({
          message: 'Profile picture updated successfully',
          profilePictureUrl,
        });
      } else {
        return res.status(400).json({ error: 'No file uploaded' });
      }
    } catch (error) {
      console.error('Error updating profile picture:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },
];
