const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees) => degrees * Math.PI / 180;
const toDegrees = (radians) => radians * 180 / Math.PI;

/**
 * Great-circle distance (haversine).
 * @param {number} lat1 Latitude of the start point.
 * @param {number} lon1 Longitude of the start point.
 * @param {number} lat2 Latitude of the end point.
 * @param {number} lon2 Longitude of the end point.
 * @returns {number} Distance in kilometres.
 */
function distanceKm (lat1, lon1, lat2, lon2) {
	const dLat = toRadians(lat2 - lat1);
	const dLon = toRadians(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2
		+ Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Initial bearing from the start point towards the end point.
 * @param {number} lat1 Latitude of the start point.
 * @param {number} lon1 Longitude of the start point.
 * @param {number} lat2 Latitude of the end point.
 * @param {number} lon2 Longitude of the end point.
 * @returns {number} Bearing in degrees, 0–360 clockwise from north.
 */
function bearingDeg (lat1, lon1, lat2, lon2) {
	const φ1 = toRadians(lat1);
	const φ2 = toRadians(lat2);
	const Δλ = toRadians(lon2 - lon1);
	const y = Math.sin(Δλ) * Math.cos(φ2);
	const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
	return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Finds the nearest cities above a population threshold.
 * @param {Array<object>} cities Cities with name, lat, lon, population, countryCode.
 * @param {number} lat Latitude of the vessel.
 * @param {number} lon Longitude of the vessel.
 * @param {object} [options] Options.
 * @param {number} [options.count] Number of cities to return.
 * @param {number} [options.minPopulation] Minimum population.
 * @returns {Array<object>} Cities sorted by distance, with distanceKm and bearing (vessel → city).
 */
function nearestCities (cities, lat, lon, { count = 2, minPopulation = 0 } = {}) {
	const best = [];
	for (const city of cities) {
		if (city.population < minPopulation) continue;
		const distance = distanceKm(lat, lon, city.lat, city.lon);
		if (best.length === count && distance >= best[count - 1].distance) continue;
		const index = best.findIndex((entry) => distance < entry.distance);
		best.splice(index === -1 ? best.length : index, 0, { city, distance });
		if (best.length > count) best.pop();
	}
	return best.map(({ city, distance }) => ({
		name: city.name,
		countryCode: city.countryCode,
		population: city.population,
		distanceKm: distance,
		bearing: bearingDeg(lat, lon, city.lat, city.lon)
	}));
}

module.exports = { bearingDeg, distanceKm, nearestCities };
