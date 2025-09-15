/* Idempotent index creation for collections used by the app */
export async function ensureIndexes(): Promise<void> {
  try {
    const [{ User }] = await Promise.all([
      import('../app/Models/User'),
    ]);
    try { await (User as any).collection.createIndex({ email: 1 }, { unique: true }); } catch {}
  } catch {}

  try {
    const Post = (await import('../app/Models/Post')).Post as any;
    try { await Post.collection.createIndex({ createdAt: -1 }); } catch {}
    try { await Post.collection.createIndex({ user: 1, createdAt: -1 }); } catch {}
  } catch {}

  try {
    const WorkoutLog = (await import('../models/WorkoutLog')).default as any;
    try { await WorkoutLog.collection.createIndex({ user: 1, date: -1 }); } catch {}
  } catch {}

  try {
    const StudentSnapshot = (await import('../models/StudentSnapshot')).default as any;
    try { await StudentSnapshot.collection.createIndex({ user: 1 }, { unique: true }); } catch {}
  } catch {}

  try {
    const ChangeEvent = (await import('../models/ChangeEvent')).default as any;
    try { await ChangeEvent.collection.createIndex({ user: 1, createdAt: -1 }); } catch {}
  } catch {}
}




