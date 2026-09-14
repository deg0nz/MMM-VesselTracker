/**
 * @param {number} mmsi Vessel MMSI.
 * @returns {object} Empty vessel state.
 */
function createVessel (mmsi) {
	return {
		mmsi,
		name: null,
		callSign: null,
		destination: null,
		shipType: null,
		imo: null,
		position: null,
		waterBody: null
	};
}

// A bogus future timestamp would otherwise block all real updates.
const MAX_FUTURE_MS = 5 * 60 * 1000;

/**
 * Merges a parsed AIS message into the vessel state.
 * @param {object} vessel Vessel state (mutated).
 * @param {object} message Parsed message from lib/ais.
 * @param {number} [now] Current time in epoch milliseconds.
 * @returns {boolean} True if the position changed.
 */
function applyMessage (vessel, message, now = Date.now()) {
	if (message.name) vessel.name = message.name;

	if (message.kind === "static") {
		for (const [key, value] of Object.entries(message.details)) {
			if (value !== null) vessel[key] = value;
		}
		return false;
	}

	if (message.kind === "position") {
		if (message.position.time > now + MAX_FUTURE_MS) return false;
		// Messages can arrive out of order; never go back in time.
		if (vessel.position && message.position.time < vessel.position.time) return false;
		vessel.position = message.position;
		return true;
	}

	return false;
}

module.exports = { applyMessage, createVessel };
