const { Zone } = require("../models");

// Zones change rarely but are read on every location update, so keep a short-lived in-process cache.
// (With several API instances a change is visible everywhere within TTL_MS.)
const TTL_MS = 15_000;
let cache = { at: 0, zones: [] };

async function activeZones() {
  if (Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), zones: await Zone.find({ active: true }).lean() };
  return cache.zones;
}
const invalidateZones = () => (cache.at = 0);

module.exports = { activeZones, invalidateZones };
