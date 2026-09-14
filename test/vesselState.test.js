const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { parseMessage } = require("../lib/ais");
const { StateStore } = require("../lib/store");
const { applyMessage, createVessel } = require("../lib/vesselState");
const fixtures = require("./fixtures");

test("applyMessage merges positions and static data", () => {
	const vessel = createVessel(211512280);
	assert.equal(applyMessage(vessel, parseMessage(fixtures.positionReport)), true);
	assert.equal(vessel.name, "PAULINE ABICHT");
	assert.equal(vessel.position.lat, 53.52818166666667);

	const staticData = parseMessage(fixtures.shipStaticData);
	assert.equal(applyMessage(vessel, { ...staticData, mmsi: 211512280 }), false);
	assert.equal(vessel.callSign, "DK8241");
	assert.equal(vessel.imo, null);
});

test("applyMessage ignores out-of-order positions", () => {
	const vessel = createVessel(211512280);
	const newer = parseMessage(fixtures.positionReport);
	const older = structuredClone(newer);
	older.position.time -= 60000;
	older.position.lat = 1;
	applyMessage(vessel, newer);
	assert.equal(applyMessage(vessel, older), false);
	assert.equal(vessel.position.lat, newer.position.lat);
});

test("applyMessage ignores positions from the future", () => {
	const vessel = createVessel(211512280);
	const message = parseMessage(fixtures.positionReport);
	assert.equal(applyMessage(vessel, message, message.position.time - 10 * 60 * 1000), false);
	assert.equal(vessel.position, null);
	assert.equal(applyMessage(vessel, message, message.position.time), true);
});

test("StateStore keeps pending data when a write fails", () => {
	const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt-store-")), "not-a-directory");
	fs.writeFileSync(blocker, "");
	const errors = [];
	const store = new StateStore(path.join(blocker, "state.json"), { onError: (error) => errors.push(error) });
	store.scheduleSave(() => ({ 1: { mmsi: 1 } }));
	assert.equal(store.flush(), false);
	assert.equal(errors.length, 1);
	assert.notEqual(store.getData, null, "data must be retried later");
});

test("StateStore persists and reloads state, tolerating missing files", () => {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vt-store-")), "nested", "state.json");
	const store = new StateStore(file, { writeDelayMs: 60000 });
	assert.deepEqual(store.load(), {});

	store.scheduleSave(() => ({ 1: { mmsi: 1, name: "first" } }));
	store.scheduleSave(() => ({ 1: { mmsi: 1, name: "latest" } }));
	assert.equal(fs.existsSync(file), false, "writes are throttled");
	store.flush();
	assert.deepEqual(new StateStore(file).load(), { 1: { mmsi: 1, name: "latest" } });

	fs.writeFileSync(file, "{ corrupt");
	assert.deepEqual(new StateStore(file).load(), {});
});
