const env = require("../config/env");
const { AutoZoneCell, Incident } = require("../models");
const { distanceM } = require("./geo");
const logger = require("../utils/logger");

/**
 * Automatic zones, so a traveller is covered anywhere - not only inside areas an authority has drawn.
 *
 *  1. OpenStreetMap places become zones by transparent rules (see RULES): police / hospitals = SAFE havens,
 *     rest areas / fuel / hotels = REST_POINT, cliffs / beaches / bars = CAUTION, military land / prisons /
 *     airfields = RESTRICTED, mine shafts and tagged hazards = DANGER.
 *  2. Our own incident history becomes DANGER hotspots: several real incidents close together in the last 30 days.
 *
 * Authority-drawn zones always win (see zones.resolveZones). Everything here is cached per ~6 km cell and is
 * never awaited on the hot path: the first location in a new cell gets no automatic zones while they load.
 */

const CELL_DEG = 0.06;          // ~6.6 km
const PAD_DEG = 0.01;           // fetch a bit beyond the cell so edges are covered
const MEM_TTL_MS = 60 * 60_000; // in-process
const FAIL_TTL_MS = 10 * 60_000;
const HOTSPOT_TTL_MS = 5 * 60_000;
const MAX_ZONES_PER_CELL = 300;
const MAX_POLY_POINTS = 40;
const HOTSPOT_DAYS = 30;
const HOTSPOT_RADIUS_M = 400;

const cellKey = (p) => `${Math.floor(p.latitude / CELL_DEG)}:${Math.floor(p.longitude / CELL_DEG)}`;
const cellBox = (p) => {
  const s = Math.floor(p.latitude / CELL_DEG) * CELL_DEG, w = Math.floor(p.longitude / CELL_DEG) * CELL_DEG;
  return { s: s - PAD_DEG, w: w - PAD_DEG, n: s + CELL_DEG + PAD_DEG, e: w + CELL_DEG + PAD_DEG };
};

// ---- rules: OSM tags -> zone ---------------------------------------------------------------------------------------
// area: true = use the mapped outline when there is one, otherwise a circle of radius_m around the place.
const RULES = [
  { match: (t) => t.landuse === "military" || ["yes", "airfield", "barracks", "base", "danger_area", "naval_base", "training_area", "range"].includes(t.military), type: "RESTRICTED", risk: "HIGH", label: "Military area", note: "Entry is not allowed without permission.", area: true, radius_m: 400 },
  { match: (t) => t.amenity === "prison", type: "RESTRICTED", risk: "HIGH", label: "Prison", note: "Restricted area. Do not photograph or loiter.", area: true, radius_m: 200 },
  { match: (t) => t.aeroway === "aerodrome" || t.aeroway === "helipad", type: "RESTRICTED", risk: "HIGH", label: "Airfield", note: "Restricted airfield area.", area: true, radius_m: 300 },
  { match: (t) => t.man_made === "mineshaft" || t.man_made === "adit", type: "DANGER", risk: "HIGH", label: "Mine shaft", note: "Open mine workings. Keep away.", radius_m: 150 },
  { match: (t) => !!t.hazard, type: "DANGER", risk: "MEDIUM", label: "Mapped hazard", note: "A hazard is mapped here.", radius_m: 100 },
  { match: (t) => t.natural === "cliff", type: "CAUTION", risk: "MEDIUM", label: "Cliff edge", note: "Steep drop. Stay back from the edge, especially at night.", radius_m: 120 },
  { match: (t) => t.waterway === "waterfall", type: "CAUTION", risk: "MEDIUM", label: "Waterfall", note: "Slippery rocks and strong currents.", radius_m: 200 },
  { match: (t) => t.natural === "beach", type: "CAUTION", risk: "LOW", label: "Beach", note: "Check currents and flags before swimming.", area: true, radius_m: 150 },
  { match: (t) => t.landuse === "quarry", type: "CAUTION", risk: "MEDIUM", label: "Quarry", note: "Heavy vehicles and unstable ground.", area: true, radius_m: 150 },
  { match: (t) => t.railway === "level_crossing", type: "CAUTION", risk: "LOW", label: "Railway crossing", note: "Look both ways before crossing.", radius_m: 60 },
  { match: (t) => t.amenity === "bar" || t.amenity === "nightclub", type: "CAUTION", risk: "LOW", label: "Nightlife venue", note: "Busy at night. Keep your belongings and drinks close.", radius_m: 100 },
  { match: (t) => t.leisure === "nature_reserve" || (t.boundary === "protected_area"), type: "CAUTION", risk: "LOW", label: "Protected area", note: "Follow park rules; permits may be needed.", area: true, radius_m: 300 },
  { match: (t) => t.amenity === "police", type: "SAFE", risk: "LOW", label: "Police station", note: "Help is close by.", radius_m: 400 },
  { match: (t) => t.amenity === "hospital", type: "SAFE", risk: "LOW", label: "Hospital", note: "Medical help is close by.", radius_m: 400 },
  { match: (t) => t.amenity === "fire_station", type: "SAFE", risk: "LOW", label: "Fire station", note: "Emergency services are close by.", radius_m: 300 },
  { match: (t) => t.highway === "rest_area" || t.highway === "services", type: "REST_POINT", risk: "LOW", label: "Rest area", note: "A place to stop and rest.", area: true, radius_m: 120 },
  { match: (t) => t.amenity === "fuel" || t.amenity === "bus_station" || t.amenity === "shelter", type: "REST_POINT", risk: "LOW", label: "Rest stop", note: "A place to stop and rest.", radius_m: 100 },
  { match: (t) => ["hotel", "hostel", "guest_house", "information"].includes(t.tourism), type: "REST_POINT", risk: "LOW", label: "Stay / information point", note: "A place to rest or ask for help.", radius_m: 100 },
];
// Order matters (first match wins) and puts the most restrictive rules first.

const buildQuery = (b) => {
  const box = `(${b.s},${b.w},${b.n},${b.e})`;
  const parts = [
    `nwr["landuse"~"^(military|quarry)$"]${box}`, `nwr["military"]${box}`, `nwr["amenity"~"^(prison|police|hospital|fire_station|fuel|bus_station|shelter|bar|nightclub)$"]${box}`,
    `nwr["aeroway"~"^(aerodrome|helipad)$"]${box}`, `nwr["man_made"~"^(mineshaft|adit)$"]${box}`, `nwr["hazard"]${box}`,
    `nwr["natural"~"^(cliff|beach)$"]${box}`, `nwr["waterway"="waterfall"]${box}`, `nwr["railway"="level_crossing"]${box}`,
    `nwr["leisure"="nature_reserve"]${box}`, `nwr["boundary"="protected_area"]${box}`, `nwr["highway"~"^(rest_area|services)$"]${box}`,
    `nwr["tourism"~"^(hotel|hostel|guest_house|information)$"]${box}`,
  ];
  return `[out:json][timeout:25];(${parts.join(";")};);out geom 1500;`;
};

// ---- OSM element -> zone -------------------------------------------------------------------------------------------
const SEVERITY = { RESTRICTED: 4, DANGER: 3, CAUTION: 2, REST_POINT: 1, SAFE: 0 };

function geometryOf(el) {
  if (el.type === "node") return { points: [{ latitude: el.lat, longitude: el.lon }] };
  if (el.type === "way" && Array.isArray(el.geometry)) return { points: el.geometry.map((g) => ({ latitude: g.lat, longitude: g.lon })) };
  if (el.bounds) return { bounds: el.bounds };
  return null;
}
const centroid = (pts) => ({ latitude: pts.reduce((a, p) => a + p.latitude, 0) / pts.length, longitude: pts.reduce((a, p) => a + p.longitude, 0) / pts.length });
function decimate(pts, max) {
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  return Array.from({ length: max }, (_, i) => pts[Math.floor(i * step)]);
}

/** Pure: Overpass JSON -> zone objects (same shape as stored zones, plus source / basis). */
function classify(json) {
  const out = [];
  const seen = new Set();
  for (const el of json?.elements || []) {
    const tags = el.tags || {};
    const rule = RULES.find((r) => r.match(tags));
    const g = geometryOf(el);
    if (!rule || !g) continue;
    const id = `auto:osm:${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    let shape;
    const closed = g.points && g.points.length >= 4 && g.points[0].latitude === g.points.at(-1).latitude && g.points[0].longitude === g.points.at(-1).longitude;
    if (rule.area && closed) shape = { kind: "POLYGON", polygon: decimate(g.points.slice(0, -1), MAX_POLY_POINTS) };
    else if (g.bounds) {
      const c = { latitude: (g.bounds.minlat + g.bounds.maxlat) / 2, longitude: (g.bounds.minlon + g.bounds.maxlon) / 2 };
      const half = distanceM({ latitude: g.bounds.minlat, longitude: g.bounds.minlon }, { latitude: g.bounds.maxlat, longitude: g.bounds.maxlon }) / 2;
      shape = { kind: "CIRCLE", center: c, radius_m: Math.round(Math.min(Math.max(half, rule.radius_m), 5000)) };
    } else {
      const c = g.points.length === 1 ? g.points[0] : centroid(g.points);
      const spread = g.points.length > 1 ? Math.max(...g.points.map((p) => distanceM(c, p))) : 0;
      shape = { kind: "CIRCLE", center: c, radius_m: Math.round(Math.min(Math.max(spread + 30, rule.radius_m), 3000)) };
    }
    if (shape.kind === "CIRCLE" && (!Number.isFinite(shape.center.latitude) || !Number.isFinite(shape.center.longitude))) continue;
    out.push({
      _id: id, id, name: tags.name || tags["name:en"] || rule.label, type: rule.type, risk_level: rule.risk, active: true,
      description: rule.note, source: "AUTO", basis: `OpenStreetMap: ${rule.label}`, shape,
    });
  }
  return out.sort((a, b) => SEVERITY[b.type] - SEVERITY[a.type]).slice(0, MAX_ZONES_PER_CELL);
}

/** Pure: incident points -> DANGER hotspot circles. Needs >= minCount incidents within 400 m of each other. */
function hotspots(points, minCount = 3) {
  const left = points.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  const out = [];
  const used = new Set();
  for (let i = 0; i < left.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    for (let j = 0; j < left.length; j++) if (j !== i && !used.has(j) && distanceM(left[i], left[j]) <= HOTSPOT_RADIUS_M) group.push(j);
    if (group.length < minCount) continue;
    group.forEach((k) => used.add(k));
    const pts = group.map((k) => left[k]);
    const c = centroid(pts);
    const radius = Math.round(Math.min(800, Math.max(250, Math.max(...pts.map((p) => distanceM(c, p))) + 100)));
    out.push({
      _id: `auto:hot:${c.latitude.toFixed(3)},${c.longitude.toFixed(3)}`, id: `auto:hot:${c.latitude.toFixed(3)},${c.longitude.toFixed(3)}`,
      name: "Incident hotspot", type: "DANGER", risk_level: group.length >= 5 ? "HIGH" : "MEDIUM", active: true,
      description: `${group.length} incidents were reported here in the last ${HOTSPOT_DAYS} days. Stay alert.`,
      source: "AUTO", basis: `Incident history: ${group.length} reports in ${HOTSPOT_DAYS} days`, shape: { kind: "CIRCLE", center: c, radius_m: radius },
    });
  }
  return out;
}

// ---- fetching & caching --------------------------------------------------------------------------------------------
let enabled = env.AUTO_ZONES;
let fetcher = async (query) => {
  let lastErr;
  for (const url of env.overpassUrls) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25_000);
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "smart-tourist-safety/1.0" }, body: `data=${encodeURIComponent(query)}`, signal: ctl.signal }).finally(() => clearTimeout(timer));
      if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
      return r.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
};

const mem = new Map();      // cellKey -> { at, zones, failed }
const pending = new Map();  // cellKey -> Promise
const hot = new Map();      // cellKey -> { at, zones }

async function refreshCell(point) {
  const key = cellKey(point);
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    try {
      const zones = classify(await fetcher(buildQuery(cellBox(point))));
      mem.set(key, { at: Date.now(), zones });
      await AutoZoneCell.updateOne({ key }, { key, zones, fetched_at: new Date() }, { upsert: true }).catch(() => {});
      return zones;
    } catch (err) {
      logger.warn({ err: err.message, key }, "automatic zones: could not load OpenStreetMap data");
      mem.set(key, { at: Date.now() - (MEM_TTL_MS - FAIL_TTL_MS), zones: [], failed: true });
      return [];
    } finally { pending.delete(key) }
  })();
  pending.set(key, p);
  return p;
}

async function osmZones(point, { wait = false } = {}) {
  const key = cellKey(point);
  const m = mem.get(key);
  if (m && Date.now() - m.at < MEM_TTL_MS) return m.zones;
  const saved = await AutoZoneCell.findOne({ key }).lean().catch(() => null);
  if (saved) { mem.set(key, { at: Date.now(), zones: saved.zones }); return saved.zones; }
  const job = refreshCell(point);
  return wait ? job : [];
}

async function hotspotZones(point) {
  const key = cellKey(point);
  const h = hot.get(key);
  if (h && Date.now() - h.at < HOTSPOT_TTL_MS) return h.zones;
  const b = cellBox(point);
  const rows = await Incident.find({
    created_at: { $gt: new Date(Date.now() - HOTSPOT_DAYS * 86400_000) }, status: { $ne: "FALSE_ALARM" },
    latitude: { $gte: b.s, $lte: b.n }, longitude: { $gte: b.w, $lte: b.e },
  }).select("latitude longitude").limit(2000).lean().catch(() => []);
  const zones = hotspots(rows, env.AUTO_ZONE_HOTSPOT_MIN);
  hot.set(key, { at: Date.now(), zones });
  return zones;
}

/** Automatic zones around a point. Never throws; without `wait` it never waits for the network. */
async function autoZonesNear(point, opts = {}) {
  if (!enabled || point?.latitude == null || point?.longitude == null) return [];
  try {
    const [osm, hotZones] = await Promise.all([osmZones(point, opts), hotspotZones(point)]);
    return [...hotZones, ...osm];
  } catch (err) {
    logger.warn({ err: err.message }, "automatic zones failed");
    return [];
  }
}

// test hooks
const _test = { setEnabled: (v) => { enabled = v }, setFetcher: (f) => { fetcher = f }, reset: () => { mem.clear(); pending.clear(); hot.clear() }, cellKey, buildQuery, cellBox };

module.exports = { autoZonesNear, classify, hotspots, _test, isEnabled: () => enabled };
