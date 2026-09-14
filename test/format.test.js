const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ageParts, compassPoint, formatCoordinate, formatDistance } = require("../lib/format");

test("formatCoordinate supports nautical, DMS and decimal styles", () => {
	assert.equal(formatCoordinate(54.502, "lat"), "54° 30.120′ N");
	assert.equal(formatCoordinate(-10.25, "lon", "ddm"), "10° 15.000′ W");
	assert.equal(formatCoordinate(54.5, "lat", "dms"), "54° 30′ 00″ N");
	assert.equal(formatCoordinate(-33.8568, "lat", "decimal"), "33.85680° S");
	// Rounding must not produce 60 minutes.
	assert.equal(formatCoordinate(9.9999999, "lon"), "10° 00.000′ E");
	assert.equal(formatCoordinate(9.9999999, "lon", "dms"), "10° 00′ 00″ E");
});

test("compassPoint maps bearings to 8 points", () => {
	assert.equal(compassPoint(0), "N");
	assert.equal(compassPoint(22.4), "N");
	assert.equal(compassPoint(22.6), "NE");
	assert.equal(compassPoint(225), "SW");
	assert.equal(compassPoint(350), "N");
	assert.equal(compassPoint(-90), "W");
});

test("formatDistance converts units", () => {
	assert.equal(formatDistance(34.4), "34 km");
	assert.equal(formatDistance(5.55), "5.5 km");
	assert.equal(formatDistance(18.52, "nm"), "10 nm");
	assert.equal(formatDistance(1.609344, "mi"), "1.0 mi");
	assert.equal(formatDistance(12, "parsecs"), "12 km");
});

test("ageParts picks a readable unit", () => {
	assert.deepEqual(ageParts(30 * 1000), { key: "AGE_NOW", count: 0 });
	assert.deepEqual(ageParts(5 * 60 * 1000), { key: "AGE_MINUTES", count: 5 });
	assert.deepEqual(ageParts(3.5 * 3600 * 1000), { key: "AGE_HOURS", count: 3 });
	assert.deepEqual(ageParts(3 * 24 * 3600 * 1000), { key: "AGE_DAYS", count: 3 });
	assert.deepEqual(ageParts(-1000), { key: "AGE_NOW", count: 0 });
});
