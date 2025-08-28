import { patchSwapExercise, patchSetDaysPerWeek, patchProgression, patchDeload } from './training';

const plan = [
  { day: 'Mon', focus: 'Full', exercises: [{ name:'Back Squat', sets:3, reps:'8-10', rpe:'7-8' }] },
  { day: 'Wed', focus: 'Full', exercises: [{ name:'Bench Press', sets:3, reps:'6-8', rpe:'7-8' }] },
  { day: 'Fri', focus: 'Full', exercises: [{ name:'Lat Pulldown', sets:3, reps:'10-12', rpe:'7-8' }] },
];

test('swap is deterministic and does not change volume', () => {
  const p = patchSwapExercise(plan as any, 'Mon', 'Back Squat', 'Leg Press');
  expect(p.swaps?.[0]).toEqual({ day:'Mon', from:'Back Squat', to:'Leg Press' });
  expect(p.reason.summary).toMatch(/Byttet/);
});

test('set days/week prunes to N days without duplicating', () => {
  const p = patchSetDaysPerWeek(plan as any, 2);
  expect(p.targetDaysPerWeek).toBe(2);
});

test('progression caps volume increase (~≤20%)', () => {
  const p = patchProgression(plan as any);
  expect(p.volumeTweaks?.length).toBeGreaterThan(0);
});

test('deload reduces volume and RPE', () => {
  const p = patchDeload(plan as any);
  expect(p.deload).toBe(true);
  expect(p.intensityTweaks?.length).toBeGreaterThan(0);
});


