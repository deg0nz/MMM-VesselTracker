const POSITION_TYPES = ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"];
const STATIC_TYPE = "ShipStaticData";
const WORLD_BOUNDING_BOX = [[[-90, -180], [90, 180]]];

// AIS encodes "not available" with out-of-range sentinel values.
const SOG_NOT_AVAILABLE = 102.3;
const COG_NOT_AVAILABLE = 360;
const HEADING_NOT_AVAILABLE = 511;

/**
 * Builds the aisstream.io subscription message for the given vessels.
 * @param {string} apiKey aisstream.io API key.
 * @param {Iterable<number>} mmsis MMSIs to receive messages for.
 * @returns {object} Subscription message.
 */
function buildSubscription (apiKey, mmsis) {
	return {
		APIKey: apiKey,
		BoundingBoxes: WORLD_BOUNDING_BOX,
		FiltersShipMMSI: [...mmsis].map(String),
		FilterMessageTypes: [...POSITION_TYPES, STATIC_TYPE]
	};
}

/**
 * Parses aisstream's time format, e.g. "2026-09-14 17:16:02.550563014 +0000 UTC".
 * @param {string} value Time string from the message metadata.
 * @returns {number|null} Epoch milliseconds or null if unparseable.
 */
function parseTimeUtc (value) {
	const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d{1,3})?\d* \+0000/.exec(value ?? "");
	if (!match) return null;
	const time = Date.parse(`${match[1]}T${match[2]}${match[3] ?? ""}Z`);
	return Number.isNaN(time) ? null : time;
}

/**
 * AIS text fields are padded with "@" and spaces.
 * @param {unknown} value Raw text.
 * @returns {string|null} Cleaned text or null if empty.
 */
function cleanText (value) {
	if (typeof value !== "string") return null;
	const text = value.replaceAll("@", "").trim();
	return text || null;
}

/**
 * @param {unknown} lat Latitude.
 * @param {unknown} lon Longitude.
 * @returns {boolean} Whether the coordinates are a real position (91/181 and 0/0 mean "not available").
 */
function isValidPosition (lat, lon) {
	return Number.isFinite(lat) && Number.isFinite(lon)
		&& Math.abs(lat) <= 90 && Math.abs(lon) <= 180
		&& !(lat === 0 && lon === 0);
}

/**
 * Normalizes a raw aisstream.io message into a position or static-data update.
 * @param {object} raw Decoded JSON message.
 * @returns {object|null} Parsed message, or null if irrelevant or invalid.
 */
function parseMessage (raw) {
	if (!raw || typeof raw !== "object") return null;
	const type = raw.MessageType;
	const body = raw.Message?.[type];
	const meta = raw.MetaData ?? {};
	const mmsi = Number(meta.MMSI ?? body?.UserID);
	if (!body || body.Valid === false || !Number.isInteger(mmsi) || mmsi <= 0) return null;

	const time = parseTimeUtc(meta.time_utc) ?? Date.now();
	const name = cleanText(meta.ShipName) ?? cleanText(body.Name);

	if (POSITION_TYPES.includes(type)) {
		const lat = body.Latitude ?? meta.latitude;
		const lon = body.Longitude ?? meta.longitude;
		if (!isValidPosition(lat, lon)) return null;
		return {
			kind: "position",
			mmsi,
			name,
			position: {
				lat,
				lon,
				sog: Number.isFinite(body.Sog) && body.Sog < SOG_NOT_AVAILABLE ? body.Sog : null,
				cog: Number.isFinite(body.Cog) && body.Cog < COG_NOT_AVAILABLE ? body.Cog : null,
				heading: Number.isFinite(body.TrueHeading) && body.TrueHeading < COG_NOT_AVAILABLE && body.TrueHeading !== HEADING_NOT_AVAILABLE ? body.TrueHeading : null,
				navStatus: Number.isInteger(body.NavigationalStatus) ? body.NavigationalStatus : null,
				time
			}
		};
	}

	if (type === STATIC_TYPE) {
		return {
			kind: "static",
			mmsi,
			name,
			details: {
				callSign: cleanText(body.CallSign),
				destination: cleanText(body.Destination),
				shipType: Number.isInteger(body.Type) && body.Type > 0 ? body.Type : null,
				imo: Number.isInteger(body.ImoNumber) && body.ImoNumber > 0 ? body.ImoNumber : null
			}
		};
	}

	return null;
}

module.exports = { buildSubscription, parseMessage, parseTimeUtc, POSITION_TYPES };
