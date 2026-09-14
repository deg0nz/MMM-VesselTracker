/*
 * Builds data/cities.json from the GeoNames "cities15000" dump
 * (all places with ≥ 15,000 inhabitants, CC BY 4.0, https://www.geonames.org).
 * Requires the `unzip` command.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SOURCE_URL = "https://download.geonames.org/export/dump/cities15000.zip";
const OUTPUT_FILE = path.join(__dirname, "..", "data", "cities.json");
// Skip city districts (PPLX) and abandoned/historical/destroyed places.
const EXCLUDED_FEATURE_CODES = new Set(["PPLX", "PPLH", "PPLQ", "PPLW"]);

const round = (value) => Math.round(Number(value) * 10000) / 10000;

async function main () {
	const response = await fetch(SOURCE_URL);
	if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
	const zipFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vesseltracker-")), "cities15000.zip");
	fs.writeFileSync(zipFile, Buffer.from(await response.arrayBuffer()));

	const text = execFileSync("unzip", ["-p", zipFile, "cities15000.txt"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	const rows = [];
	for (const line of text.split("\n")) {
		const columns = line.split("\t");
		if (columns.length < 15 || EXCLUDED_FEATURE_CODES.has(columns[7])) continue;
		rows.push([columns[1], round(columns[4]), round(columns[5]), Number(columns[14]), columns[8]]);
	}
	rows.sort((a, b) => b[3] - a[3]);

	fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
	fs.writeFileSync(OUTPUT_FILE, `[\n${rows.map((row) => JSON.stringify(row)).join(",\n")}\n]\n`);
	console.log(`Wrote ${rows.length} cities to ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
