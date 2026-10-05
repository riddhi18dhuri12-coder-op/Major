const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { activeZones } = require("../services/zones");
const { zonesAt, distanceM } = require("../services/geo");

const router = express.Router();
router.use(requireAuth);

const point = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const WEIGHT = { RESTRICTED: 10, DANGER: 6, CAUTION: 2, REST_POINT: 0, SAFE: 0 };

/** Densify a polyline so zones between two far-apart points aren't skipped. */
function sample(points, stepM = 200) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceM(points[i], points[i + 1]);
    const n = Math.max(1, Math.ceil(d / stepM));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      out.push({ latitude: points[i].latitude + (points[i + 1].latitude - points[i].latitude) * f, longitude: points[i].longitude + (points[i + 1].longitude - points[i].longitude) * f });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Score candidate routes (supplied by the client's routing provider) against the safety zones and
 * recommend the safest, with reasons. Distance only breaks ties between equally safe routes.
 */
router.post("/assess", async (req, res) => {
  const { routes } = z.object({
    routes: z.array(z.object({ name: z.string().trim().min(1).max(60), distance_km: z.number().positive().optional(), points: z.array(point).min(2).max(2000) })).min(1).max(5),
  }).parse(req.body);

  const zones = await activeZones();
  const assessed = routes.map((r) => {
    const pts = sample(r.points);
    const hits = new Map();
    let penalty = 0;
    for (const p of pts) {
      const z0 = zonesAt(p, zones)[0];
      if (!z0) continue;
      penalty += WEIGHT[z0.type];
      const h = hits.get(String(z0._id)) || { zone: z0.name, type: z0.type, samples: 0 };
      h.samples++;
      hits.set(String(z0._id), h);
    }
    const risky = [...hits.values()].filter((h) => WEIGHT[h.type] > 0);
    const score = Math.min(100, Math.round((penalty / pts.length) * 10));
    const level = risky.some((h) => h.type === "RESTRICTED") ? "HIGH" : score >= 40 ? "HIGH" : score >= 15 || risky.length ? "MEDIUM" : "LOW";
    return {
      name: r.name, distance_km: r.distance_km ?? null, risk_score: score, risk_level: level,
      passes_through: risky.map((h) => ({ zone: h.zone, type: h.type })),
      reasons: risky.length ? risky.map((h) => `Passes through ${h.type.toLowerCase()} zone "${h.zone}"`) : ["Does not cross any caution, danger or restricted zone"],
    };
  });

  const best = [...assessed].sort((a, b) => a.risk_score - b.risk_score || (a.distance_km ?? 0) - (b.distance_km ?? 0))[0];
  const others = assessed.filter((a) => a !== best);
  const extra = best.distance_km != null && others.length ? best.distance_km - Math.min(...others.map((o) => o.distance_km ?? best.distance_km)) : 0;
  res.json({
    routes: assessed,
    recommended: best.name,
    explanation: others.length && others.some((o) => o.risk_score > best.risk_score)
      ? `"${best.name}" is recommended because it has lower safety risk (${best.risk_level}) than the alternatives${extra > 0 ? `, even though it is about ${extra.toFixed(1)} km longer` : ""}.`
      : `"${best.name}" is recommended${others.length ? "; the routes are equally safe, so the shortest was chosen" : ""}.`,
  });
});

module.exports = router;
