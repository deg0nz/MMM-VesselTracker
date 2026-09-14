const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FILE = path.join(__dirname, "..", "data", "cities.json");

let cache = null;

/**
 * Loads the bundled GeoNames city list (built by scripts/build-cities.js).
 * Rows are stored compactly as [name, lat, lon, population, countryCode].
 * @param {string} [file] Path to the cities JSON file.
 * @returns {Array<object>} Cities.
 */
function loadCities (file = DEFAULT_FILE) {
	if (cache?.file === file) return cache.cities;
	const rows = JSON.parse(fs.readFileSync(file, "utf8"));
	const cities = rows.map(([name, lat, lon, population, countryCode]) => ({ name, lat, lon, population, countryCode }));
	cache = { file, cities };
	return cities;
}

module.exports = { loadCities };
