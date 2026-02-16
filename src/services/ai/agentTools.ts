/**
 * Agent Tools — OpenAI function calling definitions + execution layer.
 *
 * These tools let the mentor AI agent perform real actions:
 * write to the database, fetch user stats, log meals, etc.
 */

import { findMany, findOne, insertOne, upsert, Tables, db } from "../../lib/db";
import { nextTrainingVersion, nextNutritionVersion } from "../versioning/nextVersion";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ── Tool schema definitions (OpenAI format) ──────────────────────────────────

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "log_meal",
      description:
        "Log a meal the user has eaten. Call this after the user sends a food photo, " +
        "describes what they ate, or confirms your food analysis. " +
        "Always estimate macros as accurately as possible based on the food description/image.",
      parameters: {
        type: "object",
        properties: {
          meal_type: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack"],
            description: "Type of meal",
          },
          description: {
            type: "string",
            description: "Short human-readable summary of the meal (e.g. 'Kylling med ris og brokkoli')",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Food item name in Norwegian" },
                weight_grams: { type: "number", description: "Estimated weight in grams" },
                calories: { type: "number", description: "Estimated calories (kcal)" },
                protein_g: { type: "number", description: "Protein in grams" },
                carbs_g: { type: "number", description: "Carbohydrates in grams" },
                fat_g: { type: "number", description: "Fat in grams" },
              },
              required: ["name", "weight_grams", "calories", "protein_g", "carbs_g", "fat_g"],
            },
            description: "Individual food items with per-item macros",
          },
          total_calories: { type: "number", description: "Sum of all item calories" },
          total_protein_g: { type: "number", description: "Sum of all protein" },
          total_carbs_g: { type: "number", description: "Sum of all carbs" },
          total_fat_g: { type: "number", description: "Sum of all fat" },
          image_url: { type: "string", description: "URL of the food photo if one was provided" },
        },
        required: ["meal_type", "description", "items", "total_calories", "total_protein_g", "total_carbs_g", "total_fat_g"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_weight",
      description: "Log the user's body weight. Call when the user tells you their weight or asks to log it.",
      parameters: {
        type: "object",
        properties: {
          kg: { type: "number", description: "Weight in kilograms" },
          date: { type: "string", description: "Date in YYYY-MM-DD format. Omit for today." },
        },
        required: ["kg"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_workout",
      description: "Log a completed workout session with exercises performed.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD. Omit for today." },
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Exercise name" },
                sets: { type: "number", description: "Number of sets" },
                reps: { type: "number", description: "Reps per set" },
                load_kg: { type: "number", description: "Weight used in kg" },
              },
              required: ["name"],
            },
            description: "List of exercises performed",
          },
        },
        required: ["entries"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_stats",
      description:
        "Fetch the user's current stats: latest weight, goals, today's meal totals, " +
        "and training plan summary. Call this when you need context about the user.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meal_history",
      description: "Get the user's recent meal logs to review their eating patterns.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Days to look back. Default 7." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_barcode",
      description:
        "Look up a food product by its barcode number (EAN/UPC). Returns product name, brand, and nutritional info per 100g. " +
        "Use this when the user mentions scanning a barcode or provides a barcode number.",
      parameters: {
        type: "object",
        properties: {
          barcode: { type: "string", description: "The barcode number (EAN-13, UPC, etc.)" },
        },
        required: ["barcode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "award_points",
      description:
        "Award points to the user for achievements. Call this when the user logs a workout, hits a nutrition target, " +
        "reaches a streak milestone, sets a personal record, or shows improvement. " +
        "Valid reasons: logged_workout, logged_meal, logged_weight, hit_protein_target, hit_calorie_target, " +
        "completed_session, 3_day_streak, 7_day_streak, 14_day_streak, 30_day_streak, " +
        "weight_milestone, strength_pr, first_photo, weekly_checkin, improvement_1pct, improvement_5pct, improvement_10pct",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "The reason for awarding points" },
          metadata: { type: "object", description: "Optional extra context (e.g., exercise name, weight value)" },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_user_context",
      description:
        "Store or update an important fact about the user that should be remembered across conversations. " +
        "Use for: allergies, injuries, food preferences, lifestyle notes, motivation, schedule preferences, etc.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description:
              "Fact category. Use consistent keys: 'allergy', 'injury', 'food_preference', " +
              "'disliked_food', 'lifestyle', 'motivation', 'schedule', 'equipment', 'medical'",
          },
          value: { type: "string", description: "The fact to remember in Norwegian" },
        },
        required: ["key", "value"],
      },
    },
  },
  // ── Student Center tools (plans, goals, profile) ──
  {
    type: "function",
    function: {
      name: "save_training_plan",
      description:
        "Save a complete training plan to the student center. Call this AFTER the user has approved the plan. " +
        "The plan will appear in the student center's Activity tab. Each day should have a focus area and exercises.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "string", description: "Day label, e.g. 'Mandag', 'Tirsdag'" },
                focus: { type: "string", description: "Focus area, e.g. 'Bryst og Triceps', 'Rygg og Biceps'" },
                exercises: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Exercise name in Norwegian" },
                      sets: { type: "number", description: "Number of sets" },
                      reps: { type: "string", description: "Reps or rep range, e.g. '8-12', '6-8'" },
                      rpe: { type: "number", description: "Rate of perceived exertion (optional, 1-10)" },
                      load: { type: "string", description: "Suggested load/weight (optional)" },
                    },
                    required: ["name", "sets", "reps"],
                  },
                },
                notes: { type: "string", description: "Optional notes for this day" },
              },
              required: ["day", "focus", "exercises"],
            },
            description: "Array of training days with exercises",
          },
          reason: { type: "string", description: "Brief reason for plan creation/update" },
        },
        required: ["days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_nutrition_plan",
      description:
        "Save a nutrition/meal plan to the student center. Call this AFTER the user has approved the plan. " +
        "The plan will appear in the student center's Nutrition tab.",
      parameters: {
        type: "object",
        properties: {
          daily_targets: {
            type: "object",
            properties: {
              kcal: { type: "number", description: "Daily calorie target" },
              protein: { type: "number", description: "Daily protein target in grams" },
              carbs: { type: "number", description: "Daily carbs target in grams" },
              fat: { type: "number", description: "Daily fat target in grams" },
            },
            required: ["kcal", "protein", "carbs", "fat"],
          },
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Meal name, e.g. 'Frokost', 'Lunsj', 'Middag'" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Food item name" },
                      amount: { type: "string", description: "Amount, e.g. '200g', '2 stk'" },
                      calories: { type: "number" },
                      protein_g: { type: "number" },
                      carbs_g: { type: "number" },
                      fat_g: { type: "number" },
                    },
                    required: ["name", "amount"],
                  },
                },
              },
              required: ["name", "items"],
            },
            description: "Array of meals with food items",
          },
          notes: { type: "string", description: "General nutrition notes" },
          reason: { type: "string", description: "Brief reason for plan creation/update" },
        },
        required: ["daily_targets"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_goal",
      description:
        "Save a fitness goal to the student center. Call this AFTER the user has confirmed their goals. " +
        "The goal will appear in the student center dashboard.",
      parameters: {
        type: "object",
        properties: {
          target_weight_kg: { type: "number", description: "Target weight in kg (optional)" },
          strength_targets: { type: "string", description: "Strength goals text (e.g. 'Benkpress 100kg, Markløft 150kg')" },
          horizon_weeks: { type: "number", description: "Weeks until target (e.g. 12, 16)" },
          calories_daily_deficit: { type: "number", description: "Daily calorie deficit (if weight loss goal)" },
          weekly_weight_loss_kg: { type: "number", description: "Target weekly weight loss in kg" },
          plan: {
            type: "object",
            properties: {
              shortTerm: { type: "array", items: { type: "string" }, description: "Short-term goals (1-4 weeks)" },
              mediumTerm: { type: "array", items: { type: "string" }, description: "Medium-term goals (1-3 months)" },
              longTerm: { type: "array", items: { type: "string" }, description: "Long-term goals (3+ months)" },
              tips: { type: "array", items: { type: "string" }, description: "Tips and motivation" },
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_profile",
      description:
        "Update the user's profile data in the student center. Call when the user provides new info about themselves " +
        "that should be stored permanently (goals, weight, training preferences, etc.).",
      parameters: {
        type: "object",
        properties: {
          goals: { type: "string", description: "Updated goals text" },
          current_weight_kg: { type: "number", description: "Current weight in kg" },
          training_days_per_week: { type: "number", description: "Days per week the user trains" },
          nutrition_preferences: { type: "string", description: "Diet/nutrition preferences" },
          strengths: { type: "string", description: "User's training strengths" },
          weaknesses: { type: "string", description: "User's training weaknesses" },
          injury_history: { type: "string", description: "Injury history" },
        },
      },
    },
  },
];

// ── Tool execution ───────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * Execute a single tool call and return the result.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
): Promise<ToolResult> {
  console.log(`[agentTools] Executing: ${toolName}(${JSON.stringify(args).slice(0, 200)})`);

  try {
    switch (toolName) {
      case "log_meal":
        return await executeLogMeal(args, userId);
      case "log_weight":
        return await executeLogWeight(args, userId);
      case "log_workout":
        return await executeLogWorkout(args, userId);
      case "get_user_stats":
        return await executeGetUserStats(userId);
      case "get_meal_history":
        return await executeGetMealHistory(args, userId);
      case "lookup_barcode":
        return await executeLookupBarcode(args);
      case "award_points":
        return await executeAwardPoints(args, userId);
      case "update_user_context":
        return await executeUpdateUserContext(args, userId);
      case "save_training_plan":
        return await executeSaveTrainingPlan(args, userId);
      case "save_nutrition_plan":
        return await executeSaveNutritionPlan(args, userId);
      case "save_goal":
        return await executeSaveGoal(args, userId);
      case "update_profile":
        return await executeUpdateProfile(args, userId);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[agentTools] ${toolName} failed:`, err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

// ── Individual tool implementations ──────────────────────────────────────────

async function executeLogMeal(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const row = await insertOne(Tables.MEAL_LOGS, {
    user_id: userId,
    date: todayStr(),
    meal_type: args.meal_type || "snack",
    description: args.description || "",
    items: args.items || [],
    total_calories: args.total_calories || 0,
    total_protein_g: args.total_protein_g || 0,
    total_carbs_g: args.total_carbs_g || 0,
    total_fat_g: args.total_fat_g || 0,
    image_url: args.image_url || null,
    source: "agent",
  });

  if (!row) return { success: false, error: "Failed to insert meal log" };

  return {
    success: true,
    data: {
      id: (row as any).id,
      message: `Måltid lagret: ${args.description} (${args.total_calories} kcal, ${args.total_protein_g}g protein, ${args.total_carbs_g}g karb, ${args.total_fat_g}g fett)`,
    },
  };
}

async function executeLogWeight(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const date = args.date || todayStr();
  const kg = Number(args.kg);
  if (!kg || kg < 20 || kg > 500) {
    return { success: false, error: "Invalid weight value" };
  }

  const row = await upsert(
    Tables.WEIGHT_ENTRIES,
    { user_id: userId, date, kg },
    "user_id,date",
  );

  if (!row) return { success: false, error: "Failed to log weight" };

  return {
    success: true,
    data: { message: `Vekt logget: ${kg} kg (${date})` },
  };
}

async function executeLogWorkout(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const date = args.date || todayStr();
  const entries = args.entries || [];

  const row = await upsert(
    Tables.WORKOUT_LOGS,
    { user_id: userId, date, entries },
    "user_id,date",
  );

  if (!row) return { success: false, error: "Failed to log workout" };

  const exerciseNames = entries.map((e: any) => e.name).join(", ");
  return {
    success: true,
    data: { message: `Trening logget for ${date}: ${exerciseNames}` },
  };
}

async function executeGetUserStats(userId: string): Promise<ToolResult> {
  // Fetch in parallel: latest weight, current goal, today's meals, training plan summary, user context
  const today = todayStr();

  const [latestWeights, currentGoal, todayMeals, trainingPlan, trainingPlanVersioned, nutritionPlanVersioned, userContext] = await Promise.all([
    findMany(Tables.WEIGHT_ENTRIES, { user_id: userId }, {
      orderBy: "date",
      ascending: false,
      limit: 5,
      select: "date, kg",
    }),
    findOne(Tables.GOALS, { user_id: userId, is_current: true }, "target_weight_kg, horizon_weeks, calories_daily_deficit, weekly_weight_loss_kg, plan, strength_targets"),
    (async () => {
      const { data } = await db
        .from(Tables.MEAL_LOGS)
        .select("meal_type, total_calories, total_protein_g, total_carbs_g, total_fat_g")
        .eq("user_id", userId)
        .eq("date", today);
      return data || [];
    })(),
    findOne(Tables.TRAINING_PLANS, { user_id: userId, is_current: true }, "name, days").catch(() => null),
    // Also check versioned training plan (newer system)
    (async () => {
      const { data } = await db
        .from(Tables.TRAINING_PLAN_VERSIONS)
        .select("version, days, reason, created_at")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    })().catch(() => null),
    // Current nutrition plan version
    (async () => {
      const { data } = await db
        .from(Tables.NUTRITION_PLAN_VERSIONS)
        .select("version, kcal, protein_grams, carbs_grams, fat_grams, reason, created_at")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    })().catch(() => null),
    findMany(Tables.USER_CONTEXT, { user_id: userId }, { select: "key, value" }),
  ]);

  // Sum today's macros
  const todayTotals = (todayMeals as any[]).reduce(
    (acc: any, m: any) => ({
      calories: acc.calories + (Number(m.total_calories) || 0),
      protein: acc.protein + (Number(m.total_protein_g) || 0),
      carbs: acc.carbs + (Number(m.total_carbs_g) || 0),
      fat: acc.fat + (Number(m.total_fat_g) || 0),
      meals: acc.meals + 1,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 },
  );

  // Prefer versioned plan data, fall back to legacy training_plans table
  const trainingInfo = trainingPlanVersioned
    ? {
        version: (trainingPlanVersioned as any).version,
        dayCount: (trainingPlanVersioned as any).days?.length || 0,
        days: (trainingPlanVersioned as any).days,
        reason: (trainingPlanVersioned as any).reason,
        hasTrainingPlan: true,
      }
    : trainingPlan
    ? { name: (trainingPlan as any).name, dayCount: (trainingPlan as any).days?.length || 0, hasTrainingPlan: true }
    : { hasTrainingPlan: false };

  const nutritionInfo = nutritionPlanVersioned
    ? {
        version: (nutritionPlanVersioned as any).version,
        kcal: (nutritionPlanVersioned as any).kcal,
        protein_grams: (nutritionPlanVersioned as any).protein_grams,
        carbs_grams: (nutritionPlanVersioned as any).carbs_grams,
        fat_grams: (nutritionPlanVersioned as any).fat_grams,
        hasNutritionPlan: true,
      }
    : { hasNutritionPlan: false };

  return {
    success: true,
    data: {
      latestWeight: latestWeights[0] || null,
      weightHistory: latestWeights,
      currentGoal: currentGoal || null,
      todayNutrition: todayTotals,
      trainingPlan: trainingInfo,
      nutritionPlan: nutritionInfo,
      rememberedFacts: (userContext as any[]).reduce((acc: any, ctx: any) => {
        acc[ctx.key] = ctx.value;
        return acc;
      }, {}),
    },
  };
}

async function executeGetMealHistory(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const days = Math.min(args.days || 7, 30);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data } = await db
    .from(Tables.MEAL_LOGS)
    .select("date, meal_type, description, total_calories, total_protein_g, total_carbs_g, total_fat_g, items")
    .eq("user_id", userId)
    .gte("date", cutoffStr)
    .order("date", { ascending: false })
    .limit(50);

  // Group by date
  const byDate: Record<string, any[]> = {};
  for (const m of data || []) {
    if (!byDate[m.date]) byDate[m.date] = [];
    byDate[m.date].push(m);
  }

  // Build daily summaries
  const dailySummaries = Object.entries(byDate).map(([date, meals]) => ({
    date,
    meals: meals.length,
    totalCalories: meals.reduce((s, m) => s + (Number(m.total_calories) || 0), 0),
    totalProtein: meals.reduce((s, m) => s + (Number(m.total_protein_g) || 0), 0),
    totalCarbs: meals.reduce((s, m) => s + (Number(m.total_carbs_g) || 0), 0),
    totalFat: meals.reduce((s, m) => s + (Number(m.total_fat_g) || 0), 0),
    mealList: meals.map(m => `${m.meal_type}: ${m.description}`),
  }));

  return {
    success: true,
    data: { days, dailySummaries },
  };
}

const POINT_VALUES: Record<string, number> = {
  logged_workout: 10, logged_meal: 5, logged_weight: 5,
  hit_protein_target: 15, hit_calorie_target: 10, completed_session: 20,
  "3_day_streak": 25, "7_day_streak": 75, "14_day_streak": 150, "30_day_streak": 500,
  weight_milestone: 50, strength_pr: 30, first_photo: 10, weekly_checkin: 15,
  improvement_1pct: 20, improvement_5pct: 100, improvement_10pct: 250,
};

const REASON_TO_CATEGORY: Record<string, string> = {
  logged_workout: "discipline", logged_meal: "nutrition", logged_weight: "discipline",
  hit_protein_target: "nutrition", hit_calorie_target: "nutrition", completed_session: "strength",
  "3_day_streak": "consistency", "7_day_streak": "consistency", "14_day_streak": "consistency",
  "30_day_streak": "consistency", weight_milestone: "improvement", strength_pr: "strength",
  first_photo: "discipline", weekly_checkin: "discipline",
  improvement_1pct: "improvement", improvement_5pct: "improvement", improvement_10pct: "improvement",
};

async function executeAwardPoints(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const { reason, metadata } = args;
  if (!reason || !POINT_VALUES[reason]) {
    return { success: false, error: `Invalid reason. Valid: ${Object.keys(POINT_VALUES).join(", ")}` };
  }

  const points = POINT_VALUES[reason];
  const category = REASON_TO_CATEGORY[reason] || "discipline";

  const { error } = await db
    .from("user_points")
    .insert({ user_id: userId, category, points, reason, metadata: metadata || {} });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: { points_awarded: points, category, reason },
    message: `Tildelt ${points} poeng i kategorien "${category}" for "${reason}"`,
  };
}

async function executeLookupBarcode(args: Record<string, any>): Promise<ToolResult> {
  const { barcode } = args;
  if (!barcode || !/^\d{4,20}$/.test(String(barcode))) {
    return { success: false, error: "Invalid barcode format" };
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,nutriments,image_url,quantity,brands`,
    );

    if (!res.ok) {
      return { success: false, error: "Product not found in database" };
    }

    const data: any = await res.json();
    if (!data.product) {
      return { success: false, error: "Product not found" };
    }

    const p = data.product;
    const n = p.nutriments || {};

    return {
      success: true,
      data: {
        name: p.product_name || "Ukjent produkt",
        brand: p.brands || "",
        quantity: p.quantity || "",
        per_100g: {
          calories: Math.round(n["energy-kcal_100g"] || 0),
          protein_g: Math.round((n.proteins_100g || 0) * 10) / 10,
          carbs_g: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
          fat_g: Math.round((n.fat_100g || 0) * 10) / 10,
        },
      },
    };
  } catch {
    return { success: false, error: "Failed to look up barcode" };
  }
}

async function executeUpdateUserContext(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const { key, value } = args;
  if (!key || !value) return { success: false, error: "key and value required" };

  const row = await upsert(
    Tables.USER_CONTEXT,
    {
      user_id: userId,
      key: String(key).toLowerCase().trim(),
      value: String(value).trim(),
      source: "agent",
      updated_at: new Date().toISOString(),
    },
    "user_id,key",
  );

  if (!row) return { success: false, error: "Failed to save context" };

  return {
    success: true,
    data: { message: `Husker nå: ${key} = ${value}` },
  };
}

// ── Student Center tool implementations ──────────────────────────────────────

async function executeSaveTrainingPlan(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const days = Array.isArray(args.days) ? args.days : [];
  if (!days.length) return { success: false, error: "At least one training day is required" };

  const mappedDays = days.map((d: any) => ({
    day: d.day || "Dag",
    focus: d.focus || "",
    exercises: (d.exercises || []).map((e: any) => ({
      name: e.name,
      sets: e.sets,
      reps: String(e.reps),
      rpe: e.rpe || undefined,
      load: e.load || undefined,
    })),
    notes: d.notes || undefined,
  }));

  const version = await nextTrainingVersion(userId);
  const doc = await insertOne(Tables.TRAINING_PLAN_VERSIONS, {
    user_id: userId,
    version,
    source: "agent",
    reason: args.reason || "Laget av AI-coach",
    days: mappedDays,
  });

  if (!doc) return { success: false, error: "Failed to save training plan" };

  // Update student state to point to this version
  try {
    await upsert(Tables.STUDENT_STATES, { user_id: userId, current_training_plan_version: (doc as any).id }, "user_id");
  } catch {}

  // Log the change event
  try {
    await insertOne(Tables.CHANGE_EVENTS, {
      user_id: userId,
      type: "PLAN_EDIT",
      summary: `Treningsplan v${version} lagret av AI-coach`,
      ref_id: (doc as any).id,
      actor: userId,
      after_data: { version },
    });
  } catch {}

  const totalExercises = mappedDays.reduce((sum: number, d: any) => sum + (d.exercises?.length || 0), 0);

  return {
    success: true,
    data: {
      id: (doc as any).id,
      version,
      message: `Treningsplan lagret! ${mappedDays.length} dager med totalt ${totalExercises} øvelser. Planen er nå synlig i Student senteret under Aktivitet.`,
    },
  };
}

async function executeSaveNutritionPlan(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const dt = args.daily_targets;
  if (!dt || !dt.kcal) return { success: false, error: "daily_targets with kcal is required" };

  const version = await nextNutritionVersion(userId);
  const doc = await insertOne(Tables.NUTRITION_PLAN_VERSIONS, {
    user_id: userId,
    version,
    source: "agent",
    reason: args.reason || "Laget av AI-coach",
    kcal: dt.kcal,
    protein_grams: dt.protein || 0,
    carbs_grams: dt.carbs || 0,
    fat_grams: dt.fat || 0,
  });

  if (!doc) return { success: false, error: "Failed to save nutrition plan" };

  // Update student state
  try {
    await upsert(Tables.STUDENT_STATES, { user_id: userId, current_nutrition_plan_version: (doc as any).id }, "user_id");
  } catch {}

  // Also save to nutrition_plans table with full meal data if provided
  if (args.meals && args.meals.length) {
    try {
      await insertOne(Tables.NUTRITION_PLANS, {
        user_id: userId,
        version,
        is_current: true,
        daily_targets: { kcal: dt.kcal, protein: dt.protein, carbs: dt.carbs, fat: dt.fat },
        meals: args.meals,
        notes: args.notes || null,
        source_text: `AI-generert kostholdsplan v${version}`,
      });
      // Mark older versions as not current
      await db.from(Tables.NUTRITION_PLANS).update({ is_current: false }).eq("user_id", userId).lt("version", version);
    } catch {}
  }

  // Log change event
  try {
    await insertOne(Tables.CHANGE_EVENTS, {
      user_id: userId,
      type: "NUTRITION_EDIT",
      summary: `Kostholdsplan v${version} lagret av AI-coach`,
      ref_id: (doc as any).id,
      actor: userId,
      after_data: { version },
    });
  } catch {}

  return {
    success: true,
    data: {
      id: (doc as any).id,
      version,
      message: `Kostholdsplan lagret! Mål: ${dt.kcal} kcal, ${dt.protein || 0}g protein, ${dt.carbs || 0}g karb, ${dt.fat || 0}g fett. Planen er nå synlig i Student senteret under Ernæring.`,
    },
  };
}

async function executeSaveGoal(args: Record<string, any>, userId: string): Promise<ToolResult> {
  // Get next goal version
  const { data: lastGoal } = await db
    .from(Tables.GOALS)
    .select("version")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (lastGoal?.version ?? 0) + 1;

  // Mark older goals as not current
  await db.from(Tables.GOALS).update({ is_current: false }).eq("user_id", userId).eq("is_current", true);

  const doc = await insertOne(Tables.GOALS, {
    user_id: userId,
    version,
    is_current: true,
    target_weight_kg: args.target_weight_kg || null,
    strength_targets: args.strength_targets || null,
    horizon_weeks: args.horizon_weeks || null,
    calories_daily_deficit: args.calories_daily_deficit || null,
    weekly_weight_loss_kg: args.weekly_weight_loss_kg || null,
    plan: args.plan || {},
    source_text: `AI-generert mål v${version}`,
  });

  if (!doc) return { success: false, error: "Failed to save goal" };

  // Log change event
  try {
    await insertOne(Tables.CHANGE_EVENTS, {
      user_id: userId,
      type: "GOAL_EDIT",
      summary: `Mål v${version} lagret av AI-coach`,
      ref_id: (doc as any).id,
      actor: userId,
      after_data: { version },
    });
  } catch {}

  const parts: string[] = [];
  if (args.target_weight_kg) parts.push(`Målvekt: ${args.target_weight_kg} kg`);
  if (args.strength_targets) parts.push(`Styrke: ${args.strength_targets}`);
  if (args.horizon_weeks) parts.push(`Tidshorisont: ${args.horizon_weeks} uker`);

  return {
    success: true,
    data: {
      id: (doc as any).id,
      version,
      message: `Mål lagret! ${parts.join(", ") || "Mål opprettet"}. Synlig i Student senteret under Dashboard.`,
    },
  };
}

async function executeUpdateProfile(args: Record<string, any>, userId: string): Promise<ToolResult> {
  const updates: Record<string, any> = {};
  const fields = [
    "goals", "current_weight_kg", "training_days_per_week",
    "nutrition_preferences", "strengths", "weaknesses", "injury_history",
  ];

  for (const f of fields) {
    if (args[f] !== undefined && args[f] !== null) {
      updates[f] = args[f];
    }
  }

  if (!Object.keys(updates).length) {
    return { success: false, error: "No profile fields to update" };
  }

  updates.user_id = userId;
  updates.updated_at = new Date().toISOString();

  const row = await upsert(Tables.USER_PROFILES, updates, "user_id");
  if (!row) return { success: false, error: "Failed to update profile" };

  const updated = Object.keys(updates).filter(k => k !== "user_id" && k !== "updated_at");
  return {
    success: true,
    data: { message: `Profil oppdatert: ${updated.join(", ")}. Endringene er synlige i Student senteret.` },
  };
}

/**
 * Load all stored user_context facts for a user.
 * These are injected into the system prompt so the agent always has access.
 */
export async function loadUserContext(userId: string): Promise<Record<string, string>> {
  try {
    const rows = await findMany(Tables.USER_CONTEXT, { user_id: userId }, { select: "key, value" });
    const ctx: Record<string, string> = {};
    for (const r of rows as any[]) {
      ctx[r.key] = r.value;
    }
    return ctx;
  } catch {
    return {};
  }
}
