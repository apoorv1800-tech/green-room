// GET /api/stats
// Reads the Supabase table and returns the numbers shown on the page.

import { countRows, selectRows } from "../lib/supabase.js";

const TABLE = "pitch_reviews";

export default async function handler(req, res) {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [totalReviewed, weekRows] = await Promise.all([
      countRows(TABLE, "refused=eq.false"),
      selectRows(TABLE, `select=score,weakness_category&refused=eq.false&created_at=gte.${weekAgo}&limit=2000`),
    ]);

    const tally = {};
    let scoreSum = 0, scored = 0;
    for (const r of weekRows) {
      if (r.weakness_category) tally[r.weakness_category] = (tally[r.weakness_category] || 0) + 1;
      if (typeof r.score === "number") { scoreSum += r.score; scored++; }
    }
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const top = ranked[0] || null;

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({
      totalReviewed,
      weekCount: weekRows.length,
      avgScoreWeek: scored ? Math.round((scoreSum / scored) * 10) / 10 : null,
      topWeakness: top ? top[0] : null,
      topWeaknessShare: top ? Math.round((top[1] / weekRows.length) * 100) : null,
      weaknessBreakdown: ranked.slice(0, 5).map(([name, count]) => ({ name, count })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Stats unavailable" });
  }
}
