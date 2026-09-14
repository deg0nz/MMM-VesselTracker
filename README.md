# MMM-VesselTracker

A [MagicMirror²](https://magicmirror.builders) module that tracks a single vessel via AIS and shows:

- its coordinates, speed, course and navigational status
- a small dark map with the vessel's position
- the body of water it is in (e.g. _Persian Gulf · Strait of Hormuz_)
- the nearest large cities with distance and compass direction (e.g. _Kiel 34 km SW · Lübeck 72 km S_)
- a friendly "tracking not available" notice when the vessel goes silent, together with its last known position

Position data comes from [aisstream.io](https://aisstream.io), which is free.

## Requirements

- MagicMirror² **v2.37.0 or newer**
- A free aisstream.io API key

## Installation

Copy or clone this repository into `~/MagicMirror/modules/MMM-VesselTracker`, then install the dependencies:

```sh
cd ~/MagicMirror/modules/MMM-VesselTracker
npm install --omit=dev
```

## Getting an API key

1. Sign in at [aisstream.io](https://aisstream.io) (via GitHub).
2. Create an API key on the _API Keys_ page.

aisstream.io allows 3 connections per key. The module uses a single connection for all module instances, so you can track several vessels with one key.

## Finding a vessel's MMSI

Each module instance tracks one vessel by its 9-digit **MMSI**. Look the vessel up on [VesselFinder](https://www.vesselfinder.com) or [MarineTraffic](https://www.marinetraffic.com) and copy the MMSI from the vessel details.

## Configuration

Keep the API key out of `config.js` by using MagicMirror's secrets support. Put the key into `config/config.env`:

```sh
SECRET_AISSTREAM_API_KEY=your-key-here
```

Then reference it in `config/config.js`:

```js
let config = {
	// ...
	hideConfigSecrets: true, // keeps SECRET_* values away from the browser
	modules: [
		{
			module: "MMM-VesselTracker",
			position: "top_left",
			header: "{name}",
			config: {
				mmsi: 211210000,
				apiKey: "${SECRET_AISSTREAM_API_KEY}"
			}
		}
	]
};
```

Secrets don't work with `cors: "allowAll"`. Leave `cors` at its default (`"disabled"`) or use `"allowWhitelist"`.

If you add several MMM-VesselTracker instances, use the same secret in all of them. MagicMirror only restores secrets that appear in the first instance's config.

Instead of `apiKey`, you can also set the environment variable `AISSTREAM_API_KEY` for the MagicMirror process.

### Header

The header is MagicMirror's standard `header` option, so you can set it to anything you like. Two placeholders are replaced by the module:

| Placeholder | Replaced with |
| --- | --- |
| `{name}` | The vessel name (`vesselName` option, otherwise the name broadcast via AIS) |
| `{mmsi}` | The configured MMSI |

Example: `header: "Frigate {name}"`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `mmsi` | – | **Required.** MMSI of the vessel to track. |
| `apiKey` | `""` | aisstream.io API key (see above). |
| `vesselName` | `""` | Name to display instead of the AIS name. |
| `staleAfterMinutes` | `60` | Minutes without a position report before "tracking not available" is shown. |
| `coordinateFormat` | `"ddm"` | `"ddm"` (54° 30.120′ N, nautical), `"dms"` (54° 30′ 07″ N) or `"decimal"` (54.50200° N). |
| `distanceUnit` | `"km"` | `"km"`, `"nm"` (nautical miles) or `"mi"`. |
| `showSpeedAndCourse` | `true` | Show speed, course and navigational status. |
| `showWaterBody` | `true` | Show the body of water. |
| `showNearestCities` | `true` | Show the nearest cities. |
| `citiesCount` | `2` | Number of cities to show. |
| `minCityPopulation` | `50000` | Only consider cities with at least this many inhabitants (the bundled data starts at 15,000). |
| `showMap` | `true` | Show the map. |
| `mapWidth` / `mapHeight` | `300` / `200` | Map size in pixels. |
| `mapZoom` | `6` | Map zoom level. |
| `mapTileUrl` | CARTO Dark Matter | Leaflet tile URL template. |
| `mapAttribution` | `"© OpenStreetMap © CARTO"` | Attribution shown on the map. |

## How "tracking not available" works

AIS transponders report a moving ship's position every few seconds and an anchored ship's every few minutes. If no position has arrived for `staleAfterMinutes`, the module shows a notice together with the last known position.

The module cannot tell _why_ a vessel is silent. Warships often switch their transponders off, but aisstream.io also relies on land-based receivers, so ships far out at sea drop out of coverage even with their transponder on.

aisstream.io only streams live data, and a silent vessel sends nothing new. The module therefore saves the last known position to `data/state.json` so it survives restarts of the mirror.

## Data sources and attribution

- Vessel positions: [aisstream.io](https://aisstream.io)
- Body of water: [Marine Regions](https://www.marineregions.org) gazetteer (IHO sea areas), CC BY 4.0. English names are preferred where the gazetteer has them.
- Cities: [GeoNames](https://www.geonames.org) `cities15000`, CC BY 4.0, bundled as `data/cities.json`
- Map: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, © [CARTO](https://carto.com/attributions), rendered with [Leaflet](https://leafletjs.com)

## Development

```sh
npm install
npm test                         # unit tests
npm run build:cities             # refresh data/cities.json from GeoNames (needs `unzip`)
npm run live-test -- [mmsi] [s]  # end-to-end check against aisstream.io, needs AISSTREAM_API_KEY in .env
```

## License

[MIT](LICENSE)
