/*
 * Formatting helpers shared by the browser module and the unit tests.
 * Exposed as window.VesselTrackerFormat in the browser and via module.exports in Node.
 */
(function (root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	} else {
		root.VesselTrackerFormat = api;
	}
}(typeof self === "undefined" ? this : self, () => {
	const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
	const KM_PER_UNIT = { km: 1, nm: 1.852, mi: 1.609344 };

	/**
	 * @param {number} value Latitude or longitude.
	 * @param {"lat"|"lon"} axis Which axis the value belongs to.
	 * @param {"ddm"|"dms"|"decimal"} [style] ddm = degrees + decimal minutes (nautical standard).
	 * @returns {string} Formatted coordinate, e.g. "54° 30.120′ N".
	 */
	function formatCoordinate (value, axis, style = "ddm") {
		const hemisphere = axis === "lat" ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E");
		const abs = Math.abs(value);

		if (style === "decimal") return `${abs.toFixed(5)}° ${hemisphere}`;

		if (style === "dms") {
			const totalSeconds = Math.round(abs * 3600);
			const degrees = Math.floor(totalSeconds / 3600);
			const minutes = Math.floor(totalSeconds % 3600 / 60);
			const seconds = totalSeconds % 60;
			return `${degrees}° ${String(minutes).padStart(2, "0")}′ ${String(seconds).padStart(2, "0")}″ ${hemisphere}`;
		}

		const totalMinutes = Math.round(abs * 60 * 1000) / 1000;
		const degrees = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes - degrees * 60;
		return `${degrees}° ${minutes.toFixed(3).padStart(6, "0")}′ ${hemisphere}`;
	}

	/**
	 * @param {number} bearing Bearing in degrees.
	 * @returns {string} 8-point compass abbreviation (N, NE, …).
	 */
	function compassPoint (bearing) {
		const normalized = (bearing % 360 + 360) % 360;
		return COMPASS_POINTS[Math.round(normalized / 45) % 8];
	}

	/**
	 * @param {number} km Distance in kilometres.
	 * @param {"km"|"nm"|"mi"} [unit] Output unit.
	 * @returns {string} Formatted distance, e.g. "34 km".
	 */
	function formatDistance (km, unit = "km") {
		const safeUnit = KM_PER_UNIT[unit] ? unit : "km";
		const value = km / KM_PER_UNIT[safeUnit];
		return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${safeUnit}`;
	}

	/**
	 * @param {number} ms Age in milliseconds.
	 * @returns {{key: string, count: number}} Translation key and count for a relative age.
	 */
	function ageParts (ms) {
		const minutes = Math.floor(Math.max(0, ms) / 60000);
		if (minutes < 1) return { key: "AGE_NOW", count: 0 };
		if (minutes < 60) return { key: "AGE_MINUTES", count: minutes };
		const hours = Math.floor(minutes / 60);
		if (hours < 48) return { key: "AGE_HOURS", count: hours };
		return { key: "AGE_DAYS", count: Math.floor(hours / 24) };
	}

	return { ageParts, compassPoint, formatCoordinate, formatDistance };
}));
