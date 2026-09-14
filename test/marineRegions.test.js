const assert = require("node:assert/strict");
const { test } = require("node:test");
const { lookupWaterBody, pickWaterBody } = require("../lib/marineRegions");
const fixtures = require("./fixtures");

test("picks the smallest IHO sea area plus a named feature", () => {
	assert.deepEqual(pickWaterBody(fixtures.hormuzRecords), { name: "Persian Gulf", detail: "Strait of Hormuz" });
});

test("prefers the English name when an area is listed in several languages", () => {
	// Real records for the Elbe at Hamburg (53.52 N, 9.94 E).
	const bbox = { minLatitude: 50.995, minLongitude: -4.445, maxLatitude: 61.017, maxLongitude: 12.006 };
	const records = [
		{ MRGID: 1912, placeType: "IHO Sea Area", preferredGazetteerName: "North Atlantic Ocean", preferredGazetteerNameLang: "English", minLatitude: -0.94, minLongitude: -98.05, maxLatitude: 68.64, maxLongitude: 12.006 },
		{ MRGID: 2350, placeType: "IHO Sea Area", preferredGazetteerName: "Noordzee", preferredGazetteerNameLang: "Dutch", ...bbox },
		{ MRGID: 2350, placeType: "IHO Sea Area", preferredGazetteerName: "North Sea", preferredGazetteerNameLang: "English", ...bbox }
	];
	assert.deepEqual(pickWaterBody(records), { name: "North Sea", detail: null });
	assert.deepEqual(pickWaterBody([...records].reverse()), { name: "North Sea", detail: null });
});

test("handles antimeridian-crossing bounding boxes", () => {
	const records = [
		{ placeType: "IHO Sea Area", preferredGazetteerName: "North Pacific Ocean", minLatitude: 0, minLongitude: 117.5, maxLatitude: 66.6, maxLongitude: -77 },
		{ placeType: "IHO Sea Area", preferredGazetteerName: "Bering Sea", minLatitude: 51, minLongitude: 157, maxLatitude: 66.5, maxLongitude: -157 }
	];
	assert.deepEqual(pickWaterBody(records), { name: "Bering Sea", detail: null });
});

test("falls back to a named feature and returns null without matches", () => {
	assert.deepEqual(pickWaterBody([{ placeType: "Bight", preferredGazetteerName: "New York Bight" }]), { name: "New York Bight", detail: null });
	assert.equal(pickWaterBody([{ placeType: "General Sea Area", preferredGazetteerName: "Amphiatlantic" }]), null);
	assert.equal(pickWaterBody(undefined), null);
});

test("lookupWaterBody requests the gazetteer and handles empty answers", async () => {
	let requestedUrl;
	const fetchImpl = async (url) => {
		requestedUrl = url;
		return { ok: true, status: 200, text: async () => JSON.stringify(fixtures.hormuzRecords) };
	};
	assert.deepEqual(await lookupWaterBody(26.5, 56.3, { fetchImpl }), { name: "Persian Gulf", detail: "Strait of Hormuz" });
	assert.match(requestedUrl, /getGazetteerRecordsByLatLong\.json\/26\.5000\/56\.3000\//);

	assert.equal(await lookupWaterBody(1, 1, { fetchImpl: async () => ({ ok: false, status: 404 }) }), null);
	assert.equal(await lookupWaterBody(1, 1, { fetchImpl: async () => ({ ok: true, status: 200, text: async () => "" }) }), null);
	await assert.rejects(lookupWaterBody(1, 1, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});
