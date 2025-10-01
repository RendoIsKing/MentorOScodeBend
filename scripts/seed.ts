import 'dotenv/config';
import { connectDatabase } from '../src/utils/dbConnection';
import { User } from '../src/app/Models/User';
import { Post } from '../src/app/Models/Post';
import ChangeEvent from '../src/models/ChangeEvent';
import { Subscription } from '../src/app/Models/Subscription';
import { SubscriptionStatusEnum } from '../src/types/enums/SubscriptionStatusEnum';
import mongoose, { Types } from 'mongoose';

async function run() {
  await connectDatabase();
  const now = new Date();
  const ensure = async (email: string, patch: any) => {
    let u = await User.findOne({ email });
    if (!u) u = await User.create({ email, fullName: email.split('@')[0], isActive: true, isVerified: true, status: 'SUBSCRIBED' });
    await User.updateOne({ _id: u._id }, { $set: patch });
    return await User.findById(u._id);
  };
  const author = await ensure('author@example.com', {});
  const follower = await ensure('follower@example.com', {});
  const subscriber = await ensure('subscriber@example.com', { status: 'SUBSCRIBED' });

  const mkPost = async (userId: Types.ObjectId, privacy: string, content: string) => {
    const p = await Post.create({ user: userId, content, privacy, status: 'published', type: 'post', media: [], tags: [] });
    return p;
  };

  const p1 = await mkPost(author!._id as any, 'public', 'Hello world (public)');
  const p2 = await mkPost(author!._id as any, 'followers', 'For followers only');
  const p3 = await mkPost(author!._id as any, 'subscriber', 'For subscribers only');

  // ChangeEvents (14 days history)
  for (let i=0;i<14;i++) {
    const d = new Date(now.getTime() - i*24*3600*1000);
    await ChangeEvent.create({ user: subscriber!._id as any, type: 'PLAN_EDIT', summary: `Day ${i} change`, createdAt: d, updatedAt: d } as any);
  }

  // Active subscription
  await Subscription.create({ userId: subscriber!._id, planId: new Types.ObjectId(), StripeSubscriptionId: 'seed_sub', StripePriceId: 'seed_price', status: SubscriptionStatusEnum.ACTIVE } as any);

  console.log('Seeded: posts=', p1._id.toString(), p2._id.toString(), p3._id.toString());
  await mongoose.disconnect();
}

run().catch((e)=>{ console.error(e); process.exit(1); });


