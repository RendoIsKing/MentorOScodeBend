/* Idempotent index creation for collections used by the app */
export async function ensureIndexes(): Promise<void> {
  try {
    const [{ User }] = await Promise.all([
      import('../app/Models/User'),
    ]);
    try {
      const coll = (User as any).collection;
      // Inspect existing indexes
      let indexes: any[] = [];
      try { indexes = await coll.indexes(); } catch {}
      const emailIdx = indexes.find((i: any) => i?.name === 'email_1');
      // If an email unique index exists without partial filter, drop it to avoid null duplicates
      if (emailIdx && !emailIdx?.partialFilterExpression) {
        try { await coll.dropIndex('email_1'); } catch {}
      }
      // Create partial unique index so only real strings are enforced
      try {
        await coll.createIndex(
          { email: 1 },
          { unique: true, partialFilterExpression: { email: { $exists: true, $type: 'string' } } }
        );
      } catch {}
    } catch {}
    // Ensure unique phone identity only when values exist to avoid partial duplicates
    try {
      await (User as any).collection.createIndex(
        { completePhoneNumber: 1 },
        { unique: true, partialFilterExpression: { completePhoneNumber: { $exists: true, $type: 'string' } } }
      );
    } catch {}
    try {
      await (User as any).collection.createIndex(
        { dialCode: 1, phoneNumber: 1 },
        {
          unique: true,
          partialFilterExpression: { dialCode: { $exists: true, $type: 'string' }, phoneNumber: { $exists: true, $type: 'string' } },
        }
      );
    } catch {}
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




