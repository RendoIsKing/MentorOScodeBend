import StudentSnapshot from '../../models/StudentSnapshot';
import mongoose, { Types } from 'mongoose';
import { onWeightLogged } from './incremental';

beforeAll(async () => {
  await mongoose.connect(process.env.DB_URL || 'mongodb://127.0.0.1:27017/mentoros_test');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('onWeightLogged upserts and sorts weight series', async () => {
  const user = new Types.ObjectId();
  await onWeightLogged(user as any, '2025-08-20', 80);
  await onWeightLogged(user as any, '2025-08-18', 81);
  await onWeightLogged(user as any, '2025-08-20', 79.5); // update same day

  const snap = await StudentSnapshot.findOne({ user });
  expect(snap?.weightSeries.map((p: any) => p.t)).toEqual(['2025-08-18','2025-08-20']);
  const last = (snap as any).weightSeries[(snap as any).weightSeries.length-1]?.v;
  expect(last).toBe(79.5);
});


