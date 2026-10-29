const { Zone } = require("../models");
const { zonesAt } = require("./geo");
const { autoZonesNear } = require("./autoZones");

// Zones change rarely but are read on every location update, so keep a short-lived in-process cache.
// (With several API instances a change is visible everywhere within TTL_MS.)
const TTL_MS = 15_000;
let cache = { at: 0, zones: [] };

async function activeZones() {
  if (Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), zones: await Zone.find({ active: true }).lean() };
  return cache.zones;
}
const invalidateZones = () => (cache.at = 0);

/**
 * Zones that apply at a point: authority-drawn zones first; only where none cover the point do the automatic
 * ones (OpenStreetMap places, incident hotspots) apply. Returns { manual, auto, here } with `here` the most
 * restrictive matching zone. Auto zones load in the background, so this never waits for the network.
 */
async function zonesFor(point) {
  const [manual, auto] = await Promise.all([activeZones(), autoZonesNear(point)]);
  const m = zonesAt(point, manual);
  const here = (m.length ? m : zonesAt(point, auto))[0] || null;
  return { manual, auto, here };
}

module.exports = { activeZones, invalidateZones, zonesFor };
