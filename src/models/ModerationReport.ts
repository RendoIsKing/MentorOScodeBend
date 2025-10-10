import { Schema, model, Types } from 'mongoose';

export interface ModerationReport {
  post: Types.ObjectId;
  reporter: Types.ObjectId;
  reason?: string;
  status?: 'open' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

const ModerationReportSchema = new Schema<ModerationReport>({
  post: { type: Schema.Types.ObjectId, ref: 'Post', index: true, required: true },
  reporter: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['open','resolved'], default: 'open', index: true },
}, { timestamps: true });

ModerationReportSchema.index({ post: 1, reporter: 1, createdAt: -1 });

export default (model as any).ModerationReport || model<ModerationReport>('ModerationReport', ModerationReportSchema);


