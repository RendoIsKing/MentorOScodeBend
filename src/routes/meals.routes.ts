import { Router } from "express";
import { Auth as ensureAuth, validateZod } from "../app/Middlewares";
import { db, findById, insertOne, updateById, deleteById, upsert, Tables } from "../lib/db";
import { z } from "zod";

const r = Router();

const mealItemSchema = z.object({
  name: z.string(),
  weight_grams: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});

const createMealSchema = z.object({
  date: z.string().optional(),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  description: z.string().optional(),
  items: z.array(mealItemSchema),
  image_url: z.string().optional(),
  is_favorite: z.boolean().optional(),
}).strict();

const updateMealSchema = z.object({
  items: z.array(mealItemSchema).optional(),
  description: z.string().optional(),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  is_favorite: z.boolean().optional(),
}).strict();

function recalcTotals(items: any[]) {
  return {
    total_calories: items.reduce((s, i) => s + (Number(i.calories) || 0), 0),
    total_protein_g: items.reduce((s, i) => s + (Number(i.protein_g) || 0), 0),
    total_carbs_g: items.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0),
    total_fat_g: items.reduce((s, i) => s + (Number(i.fat_g) || 0), 0),
  };
}

// GET /meals — list meals for current user, optional date filter
r.get("/", ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || "");
    const { date, days, favorites } = req.query as any;

    let query = db.from(Tables.MEAL_LOGS).select("*").eq("user_id", me);

    if (date) {
      query = query.eq("date", date);
    } else if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(days));
      query = query.gte("date", cutoff.toISOString().slice(0, 10));
    }
    if (favorites === "true") {
      query = query.eq("is_favorite", true);
    }

    const { data } = await query.order("created_at", { ascending: false }).limit(100);
    return res.json({ meals: data || [] });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// GET /meals/today-summary — quick macro totals for today
r.get("/today-summary", ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || "");
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await db
      .from(Tables.MEAL_LOGS)
      .select("meal_type, total_calories, total_protein_g, total_carbs_g, total_fat_g, description")
      .eq("user_id", me)
      .eq("date", today);

    const meals = data || [];
    const totals = {
      calories: meals.reduce((s, m) => s + (Number(m.total_calories) || 0), 0),
      protein_g: meals.reduce((s, m) => s + (Number(m.total_protein_g) || 0), 0),
      carbs_g: meals.reduce((s, m) => s + (Number(m.total_carbs_g) || 0), 0),
      fat_g: meals.reduce((s, m) => s + (Number(m.total_fat_g) || 0), 0),
      meal_count: meals.length,
    };

    return res.json({ date: today, totals, meals });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// POST /meals — manually create a meal log
r.post(
  "/",
  ensureAuth as any,
  validateZod({ body: createMealSchema }),
  async (req: any, res) => {
    try {
      const me = String(req.user?._id || req.user?.id || "");
      const { date, meal_type, description, items, image_url, is_favorite } = req.body;
      const totals = recalcTotals(items);

      const row = await insertOne(Tables.MEAL_LOGS, {
        user_id: me,
        date: date || new Date().toISOString().slice(0, 10),
        meal_type,
        description: description || "",
        items,
        ...totals,
        image_url: image_url || null,
        is_favorite: is_favorite || false,
        source: "manual",
      });

      if (!row) return res.status(500).json({ error: "create_failed" });
      return res.status(201).json(row);
    } catch {
      return res.status(500).json({ error: "internal" });
    }
  }
);

// PATCH /meals/:id — update a meal (corrections from user)
r.patch(
  "/:id",
  ensureAuth as any,
  validateZod({ body: updateMealSchema }),
  async (req: any, res) => {
    try {
      const me = String(req.user?._id || req.user?.id || "");
      const { id } = req.params;

      const existing = await findById(Tables.MEAL_LOGS, id);
      if (!existing || String((existing as any).user_id) !== me) {
        return res.status(403).json({ error: "forbidden" });
      }

      const updates: any = {};
      if (req.body.items) {
        updates.items = req.body.items;
        Object.assign(updates, recalcTotals(req.body.items));
      }
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.meal_type !== undefined) updates.meal_type = req.body.meal_type;
      if (req.body.is_favorite !== undefined) updates.is_favorite = req.body.is_favorite;
      updates.updated_at = new Date().toISOString();

      const row = await updateById(Tables.MEAL_LOGS, id, updates);
      if (!row) return res.status(500).json({ error: "update_failed" });
      return res.json(row);
    } catch {
      return res.status(500).json({ error: "internal" });
    }
  }
);

// DELETE /meals/:id
r.delete("/:id", ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || "");
    const { id } = req.params;

    const existing = await findById(Tables.MEAL_LOGS, id);
    if (!existing || String((existing as any).user_id) !== me) {
      return res.status(403).json({ error: "forbidden" });
    }

    await deleteById(Tables.MEAL_LOGS, id);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// POST /meals/:id/favorite — toggle favorite
r.post("/:id/favorite", ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || "");
    const { id } = req.params;

    const existing = await findById<any>(Tables.MEAL_LOGS, id);
    if (!existing || String(existing.user_id) !== me) {
      return res.status(403).json({ error: "forbidden" });
    }

    const row = await updateById(Tables.MEAL_LOGS, id, {
      is_favorite: !existing.is_favorite,
      updated_at: new Date().toISOString(),
    });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// ── TEXT SEARCH via OpenFoodFacts ────────────────────────────────────────────

r.get("/search", ensureAuth as any, async (req: any, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ error: "query_too_short", results: [] });
    }

    const cc = String(req.query.cc || "no").toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(5, Number(req.query.page_size) || 25));

    const params = new URLSearchParams({
      search_terms: q,
      search_simple: "1",
      action: "process",
      json: "1",
      page: String(page),
      page_size: String(pageSize),
      fields: "product_name,brands,nutriments,image_small_url,quantity,code,countries_tags",
      sort_by: "unique_scans_n",
    });

    if (cc === "no") {
      params.set("tagtype_0", "countries");
      params.set("tag_contains_0", "contains");
      params.set("tag_0", "norway");
    }

    const offRes = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`,
      { signal: AbortSignal.timeout(8000) },
    );

    if (!offRes.ok) {
      // Fallback: search without country filter
      params.delete("tagtype_0");
      params.delete("tag_contains_0");
      params.delete("tag_0");
      const fallbackRes = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!fallbackRes.ok) return res.json({ results: [], total: 0 });
      const fbData: any = await fallbackRes.json();
      return res.json(mapOffResults(fbData));
    }

    const data: any = await offRes.json();
    const mapped = mapOffResults(data);

    // If Norway-specific search returned too few results, supplement with global
    if (mapped.results.length < 5 && page === 1) {
      params.delete("tagtype_0");
      params.delete("tag_contains_0");
      params.delete("tag_0");
      try {
        const globalRes = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`,
          { signal: AbortSignal.timeout(6000) },
        );
        if (globalRes.ok) {
          const globalData: any = await globalRes.json();
          const globalMapped = mapOffResults(globalData);
          const existingCodes = new Set(mapped.results.map((r: any) => r.barcode));
          for (const item of globalMapped.results) {
            if (!existingCodes.has(item.barcode)) {
              mapped.results.push(item);
              existingCodes.add(item.barcode);
            }
          }
          mapped.total = Math.max(mapped.total, mapped.results.length);
        }
      } catch {}
    }

    return res.json(mapped);
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return res.status(504).json({ error: "upstream_timeout", results: [] });
    }
    return res.status(500).json({ error: "internal", results: [] });
  }
});

function mapOffResults(data: any) {
  const products = (data?.products || []) as any[];
  const results = products
    .filter((p: any) => p.product_name)
    .map((p: any) => {
      const n = p.nutriments || {};
      return {
        name: p.product_name,
        brand: p.brands || "",
        barcode: p.code || "",
        image_url: p.image_small_url || null,
        quantity: p.quantity || "",
        per_100g: {
          calories: Math.round(n["energy-kcal_100g"] || n["energy-kcal"] || 0),
          protein_g: Math.round((n.proteins_100g || 0) * 10) / 10,
          carbs_g: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
          fat_g: Math.round((n.fat_100g || 0) * 10) / 10,
          fiber_g: Math.round((n.fiber_100g || 0) * 10) / 10,
        },
      };
    });

  return { results, total: Number(data?.count || results.length), page: Number(data?.page || 1) };
}

// ── BARCODE LOOKUP via OpenFoodFacts (free, no API key needed) ───────────────

r.get("/barcode/:code", ensureAuth as any, async (req: any, res) => {
  try {
    const { code } = req.params;
    if (!code || !/^\d{4,20}$/.test(code)) {
      return res.status(400).json({ error: "invalid_barcode" });
    }

    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,nutriments,image_url,quantity,brands`,
    );

    if (!offRes.ok) {
      return res.status(404).json({ error: "product_not_found" });
    }

    const data: any = await offRes.json();
    if (!data.product) {
      return res.status(404).json({ error: "product_not_found" });
    }

    const p = data.product;
    const n = p.nutriments || {};

    return res.json({
      found: true,
      product: {
        name: p.product_name || "Ukjent produkt",
        brand: p.brands || "",
        quantity: p.quantity || "",
        image_url: p.image_url || null,
        per_100g: {
          calories: Math.round(n["energy-kcal_100g"] || n["energy-kcal"] || 0),
          protein_g: Math.round((n.proteins_100g || 0) * 10) / 10,
          carbs_g: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
          fat_g: Math.round((n.fat_100g || 0) * 10) / 10,
          fiber_g: Math.round((n.fiber_100g || 0) * 10) / 10,
          sugar_g: Math.round((n.sugars_100g || 0) * 10) / 10,
          salt_g: Math.round((n.salt_100g || 0) * 10) / 10,
        },
      },
    });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// ── USER CONTEXT (agent memory / user preferences) ──────────────────────────

// GET /meals/user-context — list all remembered facts for current user
r.get("/user-context", ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || "");
    const { data } = await db
      .from(Tables.USER_CONTEXT)
      .select("*")
      .eq("user_id", me)
      .order("key");
    return res.json({ context: data || [] });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// PUT /meals/user-context/:key — manually set a fact about yourself
r.put("/user-context/:key", ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || "");
    const key = String(req.params.key).toLowerCase().trim();
    const { value } = req.body || {};
    if (!value || typeof value !== "string") {
      return res.status(400).json({ error: "value_required" });
    }

    const row = await upsert(
      Tables.USER_CONTEXT,
      {
        user_id: me,
        key,
        value: value.trim(),
        source: "manual",
        updated_at: new Date().toISOString(),
      },
      "user_id,key",
    );

    if (!row) return res.status(500).json({ error: "save_failed" });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// DELETE /meals/user-context/:key — remove a remembered fact
r.delete("/user-context/:key", ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || "");
    const key = String(req.params.key).toLowerCase().trim();

    const { error } = await db
      .from(Tables.USER_CONTEXT)
      .delete()
      .eq("user_id", me)
      .eq("key", key);

    if (error) return res.status(500).json({ error: "delete_failed" });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

export default r;
