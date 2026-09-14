const EventEmitter = require("node:events");
const WebSocket = require("ws");
const { buildSubscription, parseMessage } = require("./ais");

const STREAM_URL = "wss://stream.aisstream.io/v0/stream";
const OPEN = 1;
// aisstream.io allows at most one subscription update per second.
const SUBSCRIBE_INTERVAL_MS = 1100;

/**
 * Maintains a single aisstream.io WebSocket for all tracked vessels.
 *
 * Events: "message" (parsed AIS message), "apiError" (error text sent by
 * aisstream, e.g. invalid key), "warning" (connection problems), "status"
 * ("connected" | "disconnected").
 */
class AisStreamConnection extends EventEmitter {
	constructor ({ WebSocketImpl = WebSocket, url = STREAM_URL, minReconnectMs = 5000, maxReconnectMs = 5 * 60 * 1000, heartbeatMs = 30000, stableAfterMs = 30000 } = {}) {
		super();
		this.WebSocketImpl = WebSocketImpl;
		this.url = url;
		this.minReconnectMs = minReconnectMs;
		this.maxReconnectMs = maxReconnectMs;
		this.heartbeatMs = heartbeatMs;
		this.stableAfterMs = stableAfterMs;
		this.stableTimer = null;
		this.reconnectDelay = minReconnectMs;
		this.apiKey = null;
		this.mmsis = new Set();
		this.socket = null;
		this.reconnectTimer = null;
		this.subscribeTimer = null;
		this.heartbeatTimer = null;
		this.awaitingPong = false;
		this.lastSubscribeAt = 0;
	}

	/**
	 * Sets the API key and vessels; connects, resubscribes or disconnects as needed.
	 * @param {string} apiKey aisstream.io API key.
	 * @param {Iterable<number>} mmsis MMSIs to track.
	 */
	configure (apiKey, mmsis) {
		const nextMmsis = new Set([...mmsis].map(Number));
		const keyChanged = apiKey !== this.apiKey;
		const mmsisChanged = nextMmsis.size !== this.mmsis.size || [...nextMmsis].some((mmsi) => !this.mmsis.has(mmsi));
		this.apiKey = apiKey;
		this.mmsis = nextMmsis;

		if (!apiKey || nextMmsis.size === 0) {
			this.disconnect();
		} else if (keyChanged || (!this.socket && !this.reconnectTimer)) {
			this.disconnect();
			this.connect();
		} else if (mmsisChanged) {
			this.scheduleSubscribe();
		}
	}

	connect () {
		const socket = new this.WebSocketImpl(this.url);
		this.socket = socket;

		socket.on("open", () => {
			// aisstream accepts connections before validating the key, so only a
			// connection that stays up resets the backoff.
			this.stableTimer = setTimeout(() => {
				this.stableTimer = null;
				this.reconnectDelay = this.minReconnectMs;
				this.emit("status", "stable");
			}, this.stableAfterMs);
			this.sendSubscription();
			this.startHeartbeat();
			this.emit("status", "connected");
		});
		socket.on("message", (data) => this.handleData(data));
		socket.on("pong", () => {
			this.awaitingPong = false;
		});
		socket.on("error", (error) => this.emit("warning", `aisstream.io connection error: ${error.message}`));
		socket.on("close", () => {
			// Ignore sockets we replaced or closed on purpose.
			if (this.socket !== socket) return;
			this.socket = null;
			this.stopTimers();
			this.emit("status", "disconnected");
			this.scheduleReconnect();
		});
	}

	handleData (data) {
		let raw;
		try {
			raw = JSON.parse(data.toString());
		} catch {
			return;
		}
		if (raw?.error) {
			// Errors like an invalid key won't fix themselves quickly.
			clearTimeout(this.stableTimer);
			this.stableTimer = null;
			this.reconnectDelay = this.maxReconnectMs;
			this.emit("apiError", String(raw.error));
			return;
		}
		const message = parseMessage(raw);
		if (message && this.mmsis.has(message.mmsi)) this.emit("message", message);
	}

	sendSubscription () {
		if (this.socket?.readyState !== OPEN) return;
		this.socket.send(JSON.stringify(buildSubscription(this.apiKey, this.mmsis)));
		this.lastSubscribeAt = Date.now();
	}

	scheduleSubscribe () {
		if (this.subscribeTimer) return;
		const wait = Math.max(0, this.lastSubscribeAt + SUBSCRIBE_INTERVAL_MS - Date.now());
		this.subscribeTimer = setTimeout(() => {
			this.subscribeTimer = null;
			this.sendSubscription();
		}, wait);
	}

	scheduleReconnect () {
		if (this.reconnectTimer || !this.apiKey || this.mmsis.size === 0) return;
		const delay = this.reconnectDelay;
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectMs);
		this.emit("warning", `Reconnecting to aisstream.io in ${Math.round(delay / 1000)} s`);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	startHeartbeat () {
		this.stopHeartbeat();
		this.awaitingPong = false;
		// A silent connection is normal for a single vessel, so detect dead sockets via ping/pong.
		this.heartbeatTimer = setInterval(() => {
			if (!this.socket) return;
			if (this.awaitingPong) {
				this.emit("warning", "aisstream.io did not answer ping, reconnecting");
				this.socket.terminate();
				return;
			}
			this.awaitingPong = true;
			this.socket.ping();
		}, this.heartbeatMs);
	}

	stopHeartbeat () {
		clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = null;
	}

	stopTimers () {
		this.stopHeartbeat();
		clearTimeout(this.stableTimer);
		this.stableTimer = null;
	}

	disconnect () {
		clearTimeout(this.reconnectTimer);
		clearTimeout(this.subscribeTimer);
		this.reconnectTimer = null;
		this.subscribeTimer = null;
		this.stopTimers();
		const socket = this.socket;
		this.socket = null;
		socket?.terminate();
	}

	stop () {
		this.apiKey = null;
		this.mmsis = new Set();
		this.disconnect();
	}
}

module.exports = { AisStreamConnection };
