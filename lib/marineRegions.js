const BASE_URL = "https://www.marineregions.org/rest/getGazetteerRecordsByLatLong.json";

// Named features that are more specific than the IHO sea area, e.g. "Strait of Hormuz".
const FEATURE_PLACE_TYPES = new Set(["Strait", "Bay", "Bight", "Gulf", "Fjord", "Sound", "Channel", "Estuary", "Lagoon"]);

/**
 * @param {object} record Gazetteer record.
 * @returns {number} Bounding box area in square degrees (antimeridian-aware), Infinity if unknown.
 */
function boundingBoxArea (record) {
	const { minLatitude, minLongitude, maxLatitude, maxLongitude } = record;
	if (![minLatitude, minLongitude, maxLatitude, maxLongitude].every(Number.isFinite)) return Infinity;
	let lonSpan = maxLongitude - minLongitude;
	if (lonSpan < 0) lonSpan += 360;
	return (maxLatitude - minLatitude) * lonSpan;
}

const isEnglish = (record) => record.preferredGazetteerNameLang === "English";

/**
 * @param {object} candidate Gazetteer record.
 * @param {object|null} current Currently selected record.
 * @returns {boolean} Whether candidate covers a smaller area, or the same area with an English name.
 */
function isBetterSea (candidate, current) {
	if (!current) return true;
	const candidateArea = boundingBoxArea(candidate);
	const currentArea = boundingBoxArea(current);
	if (candidateArea !== currentArea) return candidateArea < currentArea;
	return isEnglish(candidate) && !isEnglish(current);
}

/**
 * Picks a display name from Marine Regions gazetteer records.
 * The IHO sea area is the primary name; nested IHO areas (Persian Gulf inside
 * Indian Ocean) are resolved by taking the smallest one. The same area can be
 * listed once per language (North Sea / Noordzee), so English names win.
 * @param {Array<object>} records Gazetteer records for a point.
 * @returns {{name: string, detail: string|null}|null} Water body, or null if none found.
 */
function pickWaterBody (records) {
	if (!Array.isArray(records)) return null;

	let sea = null;
	for (const record of records) {
		if (record.placeType === "IHO Sea Area" && isBetterSea(record, sea)) sea = record;
	}
	const features = records.filter((record) => FEATURE_PLACE_TYPES.has(record.placeType)
		&& record.preferredGazetteerName !== sea?.preferredGazetteerName
		&& (sea?.MRGID === undefined || record.MRGID !== sea.MRGID));
	const feature = features.find(isEnglish) ?? features[0];

	if (!sea && !feature) return null;
	return {
		name: (sea ?? feature).preferredGazetteerName,
		detail: sea && feature ? feature.preferredGazetteerName : null
	};
}

/**
 * Looks up the body of water for a position via the free Marine Regions gazetteer.
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @param {object} [options] Options.
 * @param {Function} [options.fetchImpl] fetch implementation.
 * @param {number} [options.timeoutMs] Request timeout.
 * @returns {Promise<{name: string, detail: string|null}|null>} Water body, or null if none found.
 */
async function lookupWaterBody (lat, lon, { fetchImpl = fetch, timeoutMs = 30000 } = {}) {
	const url = `${BASE_URL}/${lat.toFixed(4)}/${lon.toFixed(4)}/?offset=0&count=100`;
	const response = await fetchImpl(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(timeoutMs)
	});
	// The API answers 204/404 when no records exist for a point (e.g. inland).
	if (response.status === 204 || response.status === 404) return null;
	if (!response.ok) throw new Error(`Marine Regions responded with HTTP ${response.status}`);
	const text = await response.text();
	return text.trim() ? pickWaterBody(JSON.parse(text)) : null;
}

module.exports = { lookupWaterBody, pickWaterBody };
