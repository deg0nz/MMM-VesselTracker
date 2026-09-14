const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const { test } = require("node:test");
const { setTimeout: sleep } = require("node:timers/promises");
const { AisStreamConnection } = require("../lib/aisStream");
const fixtures = require("./fixtures");

class FakeSocket extends EventEmitter {
	static instances = [];

	constructor (url) {
		super();
		this.url = url;
		this.readyState = 0;
		this.sent = [];
		this.terminated = false;
		FakeSocket.instances.push(this);
	}

	send (data) {
		this.sent.push(JSON.parse(data));
	}

	ping () {}

	terminate () {
		this.terminated = true;
		this.readyState = 3;
		this.emit("close");
	}

	serverOpen () {
		this.readyState = 1;
		this.emit("open");
	}

	serverSend (message) {
		this.emit("message", Buffer.from(JSON.stringify(message)));
	}

	serverClose () {
		this.readyState = 3;
		this.emit("close");
	}
}

function createConnection () {
	FakeSocket.instances = [];
	return new AisStreamConnection({ WebSocketImpl: FakeSocket, minReconnectMs: 10, heartbeatMs: 60000 });
}

test("subscribes with the tracked MMSIs once connected", () => {
	const connection = createConnection();
	connection.configure("key", [211512280]);
	const socket = FakeSocket.instances[0];
	assert.equal(socket.sent.length, 0, "must wait for open");
	socket.serverOpen();
	assert.deepEqual(socket.sent[0].FiltersShipMMSI, ["211512280"]);
	assert.equal(socket.sent[0].APIKey, "key");
	connection.stop();
});

test("emits messages only for tracked vessels and reports API errors", () => {
	const connection = createConnection();
	const messages = [];
	const errors = [];
	connection.on("message", (message) => messages.push(message));
	connection.on("apiError", (error) => errors.push(error));
	connection.configure("key", [211512280]);
	const socket = FakeSocket.instances[0];
	socket.serverOpen();

	socket.serverSend(fixtures.positionReport);
	socket.serverSend(fixtures.classBPositionReport);
	socket.serverSend({ error: "Api Key Is Not Valid" });

	assert.deepEqual(messages.map((message) => message.mmsi), [211512280]);
	assert.deepEqual(errors, ["Api Key Is Not Valid"]);
	connection.stop();
});

test("resubscribes on vessel changes without reconnecting", async () => {
	const connection = createConnection();
	connection.configure("key", [1]);
	const socket = FakeSocket.instances[0];
	socket.serverOpen();
	connection.configure("key", [1, 2]);
	await sleep(1200);
	assert.equal(FakeSocket.instances.length, 1);
	assert.deepEqual(socket.sent.at(-1).FiltersShipMMSI, ["1", "2"]);
	connection.stop();
});

test("reconnects after the server closes the connection", async () => {
	const connection = createConnection();
	connection.on("warning", () => {});
	connection.configure("key", [1]);
	FakeSocket.instances[0].serverOpen();
	FakeSocket.instances[0].serverClose();
	await sleep(50);
	assert.equal(FakeSocket.instances.length, 2);
	FakeSocket.instances[1].serverOpen();
	assert.deepEqual(FakeSocket.instances[1].sent[0].FiltersShipMMSI, ["1"]);
	connection.stop();
});

test("backs off while connections keep dropping and resets once stable", async () => {
	FakeSocket.instances = [];
	const connection = new AisStreamConnection({ WebSocketImpl: FakeSocket, minReconnectMs: 10, maxReconnectMs: 1000, stableAfterMs: 30, heartbeatMs: 60000 });
	const statuses = [];
	connection.on("warning", () => {});
	connection.on("status", (status) => statuses.push(status));
	connection.configure("key", [1]);

	FakeSocket.instances[0].serverOpen();
	FakeSocket.instances[0].serverClose();
	assert.equal(connection.reconnectDelay, 20);
	await sleep(30);
	FakeSocket.instances[1].serverOpen();
	FakeSocket.instances[1].serverClose();
	assert.equal(connection.reconnectDelay, 40, "a short-lived connection must not reset the backoff");

	await sleep(40);
	FakeSocket.instances[2].serverOpen();
	await sleep(60);
	assert.equal(connection.reconnectDelay, 10);
	assert.ok(statuses.includes("stable"));
	connection.stop();
});

test("waits the maximum delay after an API error", () => {
	FakeSocket.instances = [];
	const connection = new AisStreamConnection({ WebSocketImpl: FakeSocket, minReconnectMs: 10, maxReconnectMs: 1000, stableAfterMs: 30, heartbeatMs: 60000 });
	connection.on("warning", () => {});
	connection.on("apiError", () => {});
	connection.configure("bad-key", [1]);
	const socket = FakeSocket.instances[0];
	socket.serverOpen();
	socket.serverSend({ error: "Api Key Is Not Valid" });
	socket.serverClose();
	assert.equal(connection.reconnectDelay, 1000);
	assert.equal(connection.stableTimer, null);
	connection.stop();
});

test("reconnects when the API key changes and stays closed after stop", async () => {
	const connection = createConnection();
	connection.on("warning", () => {});
	connection.configure("key-1", [1]);
	connection.configure("key-2", [1]);
	assert.equal(FakeSocket.instances.length, 2);
	assert.ok(FakeSocket.instances[0].terminated);

	connection.stop();
	assert.ok(FakeSocket.instances[1].terminated);
	await sleep(50);
	assert.equal(FakeSocket.instances.length, 2, "no reconnect after stop");
});
