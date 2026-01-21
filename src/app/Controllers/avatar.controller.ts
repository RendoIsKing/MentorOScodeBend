import { Request, Response } from 'express';
import { Avatar } from '../Models/Avatar';

export class AvatarController {
  static create = async (req: Request, res: Response): Promise<Response> => {
    try {
      const payload = req.body;
      const avatar = await Avatar.create(payload);
      return res.status(201).json({ data: avatar });
    } catch (err) {
      return res.status(500).json({ error: { message: 'Something went wrong.' } });
    }
  };

  static index = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const avatars = await Avatar.find().lean();
      return res.json({ data: avatars });
    } catch {
      return res.status(500).json({ error: { message: 'Something went wrong.' } });
    }
  };

  static show = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const avatar = await Avatar.findById(id).lean();
      if (!avatar) {
        return res.status(404).json({ error: { message: 'Avatar not found.' } });
      }
      return res.json({ data: avatar });
    } catch {
      return res.status(500).json({ error: { message: 'Something went wrong.' } });
    }
  };

  static update = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const avatar = await Avatar.findByIdAndUpdate(id, req.body, { new: true });
      if (!avatar) {
        return res.status(400).json({ error: { message: 'Avatar to update does not exist.' } });
      }
      return res.json({ data: avatar });
    } catch {
      return res.status(500).json({ error: { message: 'Something went wrong.' } });
    }
  };

  static destroy = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const avatar = await Avatar.findByIdAndDelete(id);
      if (!avatar) {
        return res.status(400).json({ error: { message: 'Avatar to delete does not exist.' } });
      }
      return res.json({ data: { message: 'Avatar deleted successfully.' } });
    } catch {
      return res.status(500).json({ error: { message: 'Something went wrong.' } });
    }
  };
}

