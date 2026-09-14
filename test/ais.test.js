const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildSubscription, parseMessage, parseTimeUtc } = require("../lib/ais");
const fixtures = require("./fixtures");

test("parseTimeUtc handles aisstream's nanosecond timestamps", () => {
	assert.equal(parseTimeUtc("2026-09-14 17:16:02.550563014 +0000 UTC"), Date.parse("2026-09-14T17:16:02.550Z"));
	assert.equal(parseTimeUtc("2026-09-14 17:16:02 +0000 UTC"), Date.parse("2026-09-14T17:16:02Z"));
	assert.equal(parseTimeUtc("garbage"), null);
	assert.equal(parseTimeUtc(undefined), null);
});

test("parses a class A position report", () => {
	const message = parseMessage(fixtures.positionReport);
	assert.equal(message.kind, "position");
	assert.equal(message.mmsi, 211512280);
	assert.equal(message.name, "PAULINE ABICHT");
	assert.equal(message.position.lat, 53.52818166666667);
	assert.equal(message.position.lon, 10.054136666666666);
	assert.equal(message.position.sog, 0);
	assert.equal(message.position.heading, null, "511 means heading not available");
	assert.equal(message.position.navStatus, 0);
	assert.equal(message.position.time, Date.parse("2026-09-14T17:16:02.550Z"));
});

test("parses a class B position report and drops 'not available' speed", () => {
	const message = parseMessage(fixtures.classBPositionReport);
	assert.equal(message.kind, "position");
	assert.equal(message.position.sog, null);
	assert.equal(message.position.cog, 158.9);
	assert.equal(message.position.navStatus, null);
});

test("parses ship static data and strips AIS padding", () => {
	const message = parseMessage(fixtures.shipStaticData);
	assert.deepEqual(message, {
		kind: "static",
		mmsi: 211778450,
		name: "TWIELENFLETH",
		details: { callSign: "DK8241", destination: "DOKKERBANK._.", shipType: 99, imo: null }
	});
});

test("rejects positions that AIS marks as not available", () => {
	for (const [lat, lon] of [[91, 181], [0, 0]]) {
		const raw = structuredClone(fixtures.positionReport);
		Object.assign(raw.Message.PositionReport, { Latitude: lat, Longitude: lon });
		assert.equal(parseMessage(raw), null);
	}
});

test("ignores invalid, unknown and malformed messages", () => {
	const invalid = structuredClone(fixtures.positionReport);
	invalid.Message.PositionReport.Valid = false;
	assert.equal(parseMessage(invalid), null);
	assert.equal(parseMessage({ MessageType: "BaseStationReport", MetaData: { MMSI: 1 }, Message: { BaseStationReport: {} } }), null);
	assert.equal(parseMessage({ MessageType: "SubscriptionConfirmation", Message: { CompressionEnabled: true } }), null);
	assert.equal(parseMessage(null), null);
});

test("buildSubscription filters by MMSI world-wide", () => {
	const subscription = buildSubscription("key", new Set([211512280, 219022289]));
	assert.equal(subscription.APIKey, "key");
	assert.deepEqual(subscription.BoundingBoxes, [[[-90, -180], [90, 180]]]);
	assert.deepEqual(subscription.FiltersShipMMSI, ["211512280", "219022289"]);
	assert.ok(subscription.FilterMessageTypes.includes("ShipStaticData"));
});
