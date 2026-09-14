const assert = require("node:assert/strict");
const { test } = require("node:test");
const { bearingDeg, distanceKm, nearestCities } = require("../lib/geo");

test("distanceKm matches known distances", () => {
	// Kiel → Lübeck is roughly 64 km.
	assert.ok(Math.abs(distanceKm(54.3233, 10.1228, 53.8655, 10.6866) - 64) < 2);
	assert.equal(distanceKm(10, 20, 10, 20), 0);
});

test("bearingDeg gives compass bearings", () => {
	assert.ok(Math.abs(bearingDeg(0, 0, 1, 0) - 0) < 1e-9);
	assert.ok(Math.abs(bearingDeg(0, 0, 0, 1) - 90) < 1e-9);
	assert.ok(Math.abs(bearingDeg(0, 0, -1, 0) - 180) < 1e-9);
	assert.ok(Math.abs(bearingDeg(0, 0, 0, -1) - 270) < 1e-9);
});

test("nearestCities respects population threshold, count and order", () => {
	const cities = [
		{ name: "Far Big", lat: 55, lon: 10, population: 500000, countryCode: "DK" },
		{ name: "Near Small", lat: 54.51, lon: 10.5, population: 20000, countryCode: "DE" },
		{ name: "Mid Big", lat: 54.3, lon: 10.1, population: 250000, countryCode: "DE" },
		{ name: "Close Big", lat: 54.6, lon: 10.6, population: 60000, countryCode: "DE" }
	];
	const result = nearestCities(cities, 54.5, 10.5, { count: 2, minPopulation: 50000 });
	assert.deepEqual(result.map((city) => city.name), ["Close Big", "Mid Big"]);
	assert.ok(result[0].distanceKm < result[1].distanceKm);
	assert.ok(result[0].bearing > 0 && result[0].bearing < 90, "Close Big lies to the north-east");
	assert.equal(nearestCities(cities, 54.5, 10.5, { count: 5, minPopulation: 0 }).length, 4);
});
