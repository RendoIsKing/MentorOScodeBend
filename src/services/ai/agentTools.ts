/**
 * Agent Tools — OpenAI function calling definitions + execution layer.
 *
 * These tools let the mentor AI agent perform real actions:
 * write to the database, fetch user stats, log meals, etc.
 */

import { findById, findMany, findOne, insertOne, upsert, Tables, db } from "../../lib/db";
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
];

// ── Tool execution ───────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
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
      case "update_user_context":
        return await executeUpdateUserContext(args, userId);
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

  const [latestWeights, currentGoal, todayMeals, trainingPlan, userContext] = await Promise.all([
    findMany(Tables.WEIGHT_ENTRIES, { user_id: userId }, {
      orderBy: "date",
      ascending: false,
      limit: 5,
      select: "date, kg",
    }),
    findOne(Tables.GOALS, { user_id: userId, is_current: true }, "target_weight_kg, horizon_weeks, calories_daily_deficit, weekly_weight_loss_kg, plan"),
    (async () => {
      const { data } = await db
        .from(Tables.MEAL_LOGS)
        .select("meal_type, total_calories, total_protein_g, total_carbs_g, total_fat_g")
        .eq("user_id", userId)
        .eq("date", today);
      return data || [];
    })(),
    findOne(Tables.TRAINING_PLANS, { user_id: userId, is_current: true }, "name, days"),
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

  return {
    success: true,
    data: {
      latestWeight: latestWeights[0] || null,
      weightHistory: latestWeights,
      currentGoal: currentGoal || null,
      todayNutrition: todayTotals,
      trainingPlan: trainingPlan ? { name: (trainingPlan as any).name, dayCount: (trainingPlan as any).days?.length || 0 } : null,
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

    const data = await res.json();
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
