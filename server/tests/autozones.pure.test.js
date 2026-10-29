// Pure logic of the automatic zones - needs no database.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI ||= "mongodb://127.0.0.1:27017/unused";
process.env.JWT_ACCESS_SECRET ||= "test-access-secret-test-access-secret-0001";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-refresh-secret-02";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { classify, hotspots } = require("../src/services/autoZones");
const { zonesAt } = require("../src/services/geo");

const ring = (lat, lon, d) => [[lat - d, lon - d], [lat - d, lon + d], [lat + d, lon + d], [lat + d, lon - d], [lat - d, lon - d]].map(([la, lo]) => ({ lat: la, lon: lo }));

describe("automatic zones from OpenStreetMap", () => {
  const json = { elements: [
    { type: "node", id: 1, lat: 19.07, lon: 72.87, tags: { amenity: "police", name: "Colaba Police Station" } },
    { type: "node", id: 2, lat: 19.08, lon: 72.88, tags: { amenity: "hospital" } },
    { type: "way", id: 3, tags: { landuse: "military", name: "Naval Base" }, geometry: ring(19.1, 72.9, 0.002) },
    { type: "node", id: 4, lat: 19.11, lon: 72.91, tags: { natural: "cliff" } },
    { type: "node", id: 5, lat: 19.12, lon: 72.92, tags: { highway: "services" } },
    { type: "node", id: 6, lat: 19.13, lon: 72.93, tags: { man_made: "mineshaft" } },
    { type: "node", id: 7, lat: 19.14, lon: 72.94, tags: { amenity: "cafe" } },                 // no rule
    { type: "relation", id: 8, tags: { leisure: "nature_reserve", name: "Forest" }, bounds: { minlat: 19.2, minlon: 72.8, maxlat: 19.22, maxlon: 72.84 } },
    { type: "node", id: 1, lat: 19.07, lon: 72.87, tags: { amenity: "police" } },                // duplicate id
  ] };
  const zones = classify(json);
  const byId = Object.fromEntries(zones.map((z) => [z.id, z]));

  test("each place becomes the right kind of zone and unknown places are ignored", () => {
    assert.equal(zones.length, 7);
    assert.equal(byId["auto:osm:node/1"].type, "SAFE");
    assert.equal(byId["auto:osm:node/1"].name, "Colaba Police Station");
    assert.equal(byId["auto:osm:node/2"].name, "Hospital");
    assert.equal(byId["auto:osm:way/3"].type, "RESTRICTED");
    assert.equal(byId["auto:osm:node/4"].type, "CAUTION");
    assert.equal(byId["auto:osm:node/5"].type, "REST_POINT");
    assert.equal(byId["auto:osm:node/6"].type, "DANGER");
    assert.equal(byId["auto:osm:relation/8"].type, "CAUTION");
  });
  test("areas keep their outline, points get a circle, relations use their bounds", () => {
    assert.equal(byId["auto:osm:way/3"].shape.kind, "POLYGON");
    assert.equal(byId["auto:osm:way/3"].shape.polygon.length, 4);
    assert.equal(byId["auto:osm:node/1"].shape.kind, "CIRCLE");
    assert.equal(byId["auto:osm:node/1"].shape.radius_m, 400);
    assert.equal(byId["auto:osm:relation/8"].shape.kind, "CIRCLE");
    assert.ok(byId["auto:osm:relation/8"].shape.radius_m > 1000);
  });
  test("zones are explainable and sorted most-restrictive first; they work with the geofence", () => {
    assert.ok(zones.every((z) => z.source === "AUTO" && /^OpenStreetMap: /.test(z.basis) && z.description));
    assert.equal(zones[0].type, "RESTRICTED");
    assert.equal(zonesAt({ latitude: 19.1, longitude: 72.9 }, zones)[0].type, "RESTRICTED");   // inside the naval base outline
    assert.equal(zonesAt({ latitude: 19.0702, longitude: 72.8702 }, zones)[0].type, "SAFE");    // 30 m from the police station
    assert.equal(zonesAt({ latitude: 25, longitude: 80 }, zones).length, 0);
  });
  test("empty or broken responses give no zones instead of throwing", () => {
    assert.deepEqual(classify(null), []);
    assert.deepEqual(classify({ elements: [{ type: "way", id: 9, tags: { amenity: "police" } }] }), []);
  });
});

describe("incident hotspots", () => {
  const near = (i) => ({ latitude: 19.0 + i * 0.0005, longitude: 72.8 });   // ~55 m apart
  test("three or more incidents close together make a DANGER zone; scattered ones do not", () => {
    const z = hotspots([near(0), near(1), near(2), { latitude: 19.5, longitude: 73 }]);
    assert.equal(z.length, 1);
    assert.equal(z[0].type, "DANGER");
    assert.equal(z[0].risk_level, "MEDIUM");
    assert.match(z[0].description, /3 incidents/);
    assert.ok(z[0].shape.radius_m >= 250);
    assert.equal(hotspots([near(0), near(1), { latitude: 19.5, longitude: 73 }]).length, 0);
  });
  test("five or more raise the level to HIGH, and two separate clusters give two zones", () => {
    assert.equal(hotspots([0, 1, 2, 3, 4].map(near))[0].risk_level, "HIGH");
    const far = (i) => ({ latitude: 20.0 + i * 0.0005, longitude: 73 });
    assert.equal(hotspots([near(0), near(1), near(2), far(0), far(1), far(2)]).length, 2);
  });
});
