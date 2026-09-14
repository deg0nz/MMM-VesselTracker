/*
 * End-to-end check of the server side against the real services.
 * Usage: npm run live-test -- [mmsi] [seconds]
 * Without an MMSI, the first moving vessel seen in the western Baltic is used.
 */
const WebSocket = require("ws");
const { parseMessage } = require("../lib/ais");
const { AisStreamConnection } = require("../lib/aisStream");
const { loadCities } = require("../lib/cities");
const { nearestCities } = require("../lib/geo");
const { lookupWaterBody } = require("../lib/marineRegions");
const { applyMessage, createVessel } = require("../lib/vesselState");

const apiKey = process.env.AISSTREAM_API_KEY;
const seconds = Number(process.argv[3] ?? 45);

function discoverVessel () {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket("wss://stream.aisstream.io/v0/stream");
		const timer = setTimeout(() => {
			socket.terminate();
			reject(new Error("No moving vessel found"));
		}, 30000);
		socket.on("open", () => socket.send(JSON.stringify({ APIKey: apiKey, BoundingBoxes: [[[53.5, 9.5], [56, 12.5]]], FilterMessageTypes: ["PositionReport"] })));
		socket.on("message", (data) => {
			const message = parseMessage(JSON.parse(data.toString()));
			if (message?.kind === "position" && message.position.sog > 3) {
				clearTimeout(timer);
				socket.terminate();
				resolve(message.mmsi);
			}
		});
	});
}

async function main () {
	if (!apiKey) throw new Error("AISSTREAM_API_KEY is not set (see .env)");
	const mmsi = Number(process.argv[2]) || await discoverVessel();
	console.log(`Tracking MMSI ${mmsi} for ${seconds} s via a world-wide MMSI-filtered subscription …`);

	const vessel = createVessel(mmsi);
	let messages = 0;
	const connection = new AisStreamConnection();
	connection.on("status", (status) => console.log(`status: ${status}`));
	connection.on("warning", (warning) => console.log(`warning: ${warning}`));
	connection.on("apiError", (error) => console.log(`API error: ${error}`));
	connection.on("message", (message) => {
		messages++;
		if (message.mmsi !== mmsi) throw new Error(`Received foreign MMSI ${message.mmsi}`);
		applyMessage(vessel, message);
	});
	connection.configure(apiKey, [mmsi]);

	await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
	connection.stop();

	console.log(`messages received: ${messages}`);
	console.log("vessel:", vessel);
	if (!vessel.position) throw new Error("No position received");
	console.log("water body:", await lookupWaterBody(vessel.position.lat, vessel.position.lon));
	console.log("nearest cities:", nearestCities(loadCities(), vessel.position.lat, vessel.position.lon, { count: 2, minPopulation: 50000 }));
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
