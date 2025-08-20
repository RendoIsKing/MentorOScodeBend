import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { User } from '../../app/Models/User';

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
      const userId = (req.user as any)?.id; // Assuming user id is available in req.user.id

      // Update user's profile picture URL in the database
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if(req.file) {
        (user as any).profilePictureUrl = `/uploads/profile-pictures/${req.file.filename}`;
        await user.save();

        // Return success message and the new picture URL
        return res.json({
          message: 'Profile picture updated successfully',
          profilePictureUrl: (user as any).profilePictureUrl,
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
