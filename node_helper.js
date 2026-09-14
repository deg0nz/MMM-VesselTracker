const path = require("node:path");
const NodeHelper = require("node_helper");
const Log = require("logger");
const { AisStreamConnection } = require("./lib/aisStream");
const { loadCities } = require("./lib/cities");
const { distanceKm, nearestCities } = require("./lib/geo");
const { lookupWaterBody } = require("./lib/marineRegions");
const { StateStore } = require("./lib/store");
const { applyMessage, createVessel } = require("./lib/vesselState");

// Vessels under way report every few seconds; the mirror doesn't need that many redraws.
const MIN_EMIT_INTERVAL_MS = 5000;
const WATER_LOOKUP_MIN_DISTANCE_KM = 5;
const WATER_LOOKUP_MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * @param {unknown} configured apiKey from the module config (may be a resolved **SECRET_…** placeholder).
 * @returns {string|null} Usable API key.
 */
function resolveApiKey (configured) {
	const key = (typeof configured === "string" && configured.trim()) || process.env.AISSTREAM_API_KEY?.trim() || "";
	// An unresolved placeholder means the secret isn't set in the environment.
	if (!key || key.includes("**SECRET_")) return null;
	return key;
}

/**
 * @param {unknown} configured mapApiKey from the module config (may be a resolved **SECRET_…** placeholder).
 * @returns {string} CARTO key, or "" if none is usable.
 */
function resolveMapApiKey (configured) {
	const key = typeof configured === "string" ? configured.trim() : "";
	if (!key.includes("**SECRET_")) return key;
	Log.warn(`${key} is not set in config/config.env, map tiles will show a watermark`);
	return "";
}

module.exports = NodeHelper.create({
	start () {
		Log.log("Starting node helper");
		this.instances = new Map();
		this.apiKey = null;
		this.apiError = null;
		this.lastEmitAt = new Map();
		this.emitTimers = new Map();
		this.waterLookupAttemptAt = new Map();
		this.waterLookupsInFlight = new Set();
		this.citiesUnavailable = false;

		this.store = new StateStore(path.join(__dirname, "data", "state.json"), {
			onError: (error) => Log.warn(`Could not save vessel state: ${error.message}`)
		});
		this.vessels = new Map(Object.values(this.store.load()).map((vessel) => [vessel.mmsi, vessel]));

		this.connection = new AisStreamConnection();
		this.connection.on("message", (message) => this.handleMessage(message));
		this.connection.on("apiError", (error) => {
			Log.error(`aisstream.io error: ${error}`);
			this.apiError = error;
			this.emitAll();
		});
		this.connection.on("warning", (warning) => Log.warn(warning));
		this.connection.on("status", (status) => {
			Log.info(`aisstream.io ${status}`);
			// A silent vessel sends no messages, so a stable connection is what clears an old error.
			if (status === "stable" && this.apiError) {
				this.apiError = null;
				this.emitAll();
			}
		});
	},

	stop () {
		this.connection.stop();
		for (const timer of this.emitTimers.values()) clearTimeout(timer);
		this.store.flush();
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "VESSELTRACKER_REGISTER") return;

		const mmsi = Number(payload.mmsi);
		if (!Number.isInteger(mmsi) || mmsi <= 0) return;

		this.instances.set(payload.identifier, {
			mmsi,
			showWaterBody: payload.showWaterBody !== false,
			showNearestCities: payload.showNearestCities !== false,
			citiesCount: Number(payload.citiesCount) || 2,
			minCityPopulation: Number(payload.minCityPopulation) || 0,
			mapApiKey: resolveMapApiKey(payload.mapApiKey)
		});
		if (!this.vessels.has(mmsi)) this.vessels.set(mmsi, createVessel(mmsi));

		const apiKey = resolveApiKey(payload.apiKey) ?? this.apiKey;
		if (!apiKey) {
			Log.error("No aisstream.io API key configured");
			this.sendSocketNotification("VESSELTRACKER_UPDATE", { identifier: payload.identifier, vessel: this.vessels.get(mmsi), cities: [], error: { code: "NO_API_KEY" }, mapApiKey: this.instances.get(payload.identifier).mapApiKey });
			return;
		}
		const keyWasMissing = !this.apiKey;
		this.apiKey = apiKey;

		this.connection.configure(apiKey, new Set([...this.instances.values()].map((instance) => instance.mmsi)));
		// Instances that registered before any key was known still show "no API key".
		if (keyWasMissing) {
			this.emitAll();
		} else {
			this.emitInstance(payload.identifier);
		}
		this.maybeLookupWaterBody(this.vessels.get(mmsi));
	},

	handleMessage (message) {
		let vessel = this.vessels.get(message.mmsi);
		if (!vessel) {
			vessel = createVessel(message.mmsi);
			this.vessels.set(message.mmsi, vessel);
		}
		if (this.apiError) {
			this.apiError = null;
			this.emitAll();
		}

		if (applyMessage(vessel, message)) this.maybeLookupWaterBody(vessel);
		this.store.scheduleSave(() => this.serializeVessels());
		this.scheduleEmit(vessel.mmsi);
	},

	// Only persist vessels that are still configured, so removed modules don't linger in state.json.
	serializeVessels () {
		const configured = new Set([...this.instances.values()].map((instance) => instance.mmsi));
		return Object.fromEntries([...this.vessels].filter(([mmsi]) => configured.has(mmsi)));
	},

	scheduleEmit (mmsi) {
		if (this.emitTimers.has(mmsi)) return;
		const wait = (this.lastEmitAt.get(mmsi) ?? 0) + MIN_EMIT_INTERVAL_MS - Date.now();
		if (wait <= 0) {
			this.emitVessel(mmsi);
			return;
		}
		this.emitTimers.set(mmsi, setTimeout(() => {
			this.emitTimers.delete(mmsi);
			this.emitVessel(mmsi);
		}, wait));
	},

	emitVessel (mmsi) {
		this.lastEmitAt.set(mmsi, Date.now());
		for (const [identifier, instance] of this.instances) {
			if (instance.mmsi === mmsi) this.emitInstance(identifier);
		}
	},

	emitAll () {
		for (const identifier of this.instances.keys()) this.emitInstance(identifier);
	},

	emitInstance (identifier) {
		const instance = this.instances.get(identifier);
		const vessel = this.vessels.get(instance.mmsi);
		this.sendSocketNotification("VESSELTRACKER_UPDATE", {
			identifier,
			vessel,
			cities: instance.showNearestCities ? this.citiesFor(vessel, instance) : [],
			error: this.apiError ? { code: "API_ERROR", message: this.apiError } : null,
			mapApiKey: instance.mapApiKey
		});
	},

	citiesFor (vessel, instance) {
		if (!vessel?.position || this.citiesUnavailable) return [];
		try {
			return nearestCities(loadCities(), vessel.position.lat, vessel.position.lon, {
				count: instance.citiesCount,
				minPopulation: instance.minCityPopulation
			});
		} catch (error) {
			this.citiesUnavailable = true;
			Log.error(`Could not load city data (run "npm run build:cities"): ${error.message}`);
			return [];
		}
	},

	async maybeLookupWaterBody (vessel) {
		const { mmsi, position, waterBody } = vessel;
		if (!position || this.waterLookupsInFlight.has(mmsi)) return;
		if (![...this.instances.values()].some((instance) => instance.mmsi === mmsi && instance.showWaterBody)) return;
		if (waterBody && distanceKm(waterBody.lat, waterBody.lon, position.lat, position.lon) < WATER_LOOKUP_MIN_DISTANCE_KM) return;
		if (Date.now() - (this.waterLookupAttemptAt.get(mmsi) ?? 0) < WATER_LOOKUP_MIN_INTERVAL_MS) return;

		this.waterLookupsInFlight.add(mmsi);
		this.waterLookupAttemptAt.set(mmsi, Date.now());
		try {
			const result = await lookupWaterBody(position.lat, position.lon);
			vessel.waterBody = { name: result?.name ?? null, detail: result?.detail ?? null, lat: position.lat, lon: position.lon };
			this.store.scheduleSave(() => this.serializeVessels());
			this.emitVessel(mmsi);
		} catch (error) {
			Log.warn(`Body of water lookup failed: ${error.message}`);
		} finally {
			this.waterLookupsInFlight.delete(mmsi);
		}
	}
});
