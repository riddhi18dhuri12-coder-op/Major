const R = 6371000; // Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
function distanceM(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Ray-casting point-in-polygon (polygon = [{latitude, longitude}, ...]). */
function inPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const crosses = a.latitude > p.latitude !== b.latitude > p.latitude &&
      p.longitude < ((b.longitude - a.longitude) * (p.latitude - a.latitude)) / (b.latitude - a.latitude) + a.longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function inZone(p, zone) {
  const s = zone.shape;
  if (!s) return false;
  if (s.kind === "CIRCLE") return distanceM(p, s.center) <= s.radius_m;
  if (s.kind === "POLYGON") return s.polygon.length >= 3 && inPolygon(p, s.polygon);
  return false;
}

// When zones overlap, the most restrictive one decides.
const SEVERITY = { RESTRICTED: 4, DANGER: 3, CAUTION: 2, REST_POINT: 1, SAFE: 0 };

function zonesAt(p, zones) {
  return zones.filter((z) => z.active !== false && inZone(p, z)).sort((a, b) => SEVERITY[b.type] - SEVERITY[a.type]);
}

module.exports = { distanceM, inPolygon, inZone, zonesAt, SEVERITY };
