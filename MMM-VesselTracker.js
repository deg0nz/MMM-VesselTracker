/* global L, VesselTrackerFormat */

Module.register("MMM-VesselTracker", {
	defaults: {
		mmsi: null,
		apiKey: "",
		vesselName: "",
		staleAfterMinutes: 60,
		coordinateFormat: "ddm",
		distanceUnit: "km",
		showSpeedAndCourse: true,
		showWaterBody: true,
		showNearestCities: true,
		citiesCount: 2,
		minCityPopulation: 50000,
		showMap: true,
		mapWidth: 300,
		mapHeight: 200,
		mapZoom: 6,
		mapApiKey: "",
		mapTileUrl: "https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key={key}",
		mapAttribution: "© OpenStreetMap © CARTO"
	},

	// Secret handling in socket payloads changed in 2.35–2.37; only 2.37 is tested.
	requiresVersion: "2.37.0",

	// How long after startup a missing position is "still listening" rather than "unavailable".
	listeningGraceMs: 5 * 60 * 1000,

	getScripts () {
		return [this.file("node_modules/leaflet/dist/leaflet.js"), this.file("lib/format.js")];
	},

	getStyles () {
		return [this.file("node_modules/leaflet/dist/leaflet.css"), "font-awesome.css", this.file("css/MMM-VesselTracker.css")];
	},

	getTranslations () {
		return { en: "translations/en.json", de: "translations/de.json" };
	},

	start () {
		this.startedAt = Date.now();
		this.loaded = false;
		this.vessel = null;
		this.cities = [];
		this.error = null;
		this.map = null;
		this.marker = null;

		this.mapElement = document.createElement("div");
		this.mapElement.className = "vt-map";
		this.mapElement.style.width = `${this.config.mapWidth}px`;
		this.mapElement.style.height = `${this.config.mapHeight}px`;

		if (this.config.mmsi) {
			this.sendSocketNotification("VESSELTRACKER_REGISTER", {
				identifier: this.identifier,
				mmsi: this.config.mmsi,
				apiKey: this.config.apiKey,
				mapApiKey: this.config.mapApiKey,
				showWaterBody: this.config.showWaterBody,
				showNearestCities: this.config.showNearestCities,
				citiesCount: this.config.citiesCount,
				minCityPopulation: this.config.minCityPopulation
			});
		}

		// Keep "last seen" and the unavailable state current even without new messages.
		setInterval(() => this.updateDom(), 60 * 1000);
	},

	notificationReceived (notification) {
		// Leaflet needs a container that is attached to the page, which is only guaranteed
		// once MagicMirror has finished inserting the module content.
		if (["MODULE_DOM_CREATED", "MODULE_DOM_UPDATED"].includes(notification)) this.updateMap();
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "VESSELTRACKER_UPDATE" || payload?.identifier !== this.identifier) return;
		this.loaded = true;
		this.vessel = payload.vessel;
		this.cities = payload.cities ?? [];
		this.error = payload.error;
		// With hideConfigSecrets the browser only knows the placeholder; the helper sends the real key.
		this.mapApiKey = payload.mapApiKey ?? "";
		// No fade: an animated update finishing after a newer one would put stale content back.
		this.updateDom();
	},

	getHeader () {
		if (typeof this.data.header !== "string") return this.data.header;
		// MagicMirror renders headers as HTML and AIS names are chosen by the ship's crew.
		return this.data.header
			.replaceAll("{name}", escapeHtml(this.vesselName()))
			.replaceAll("{mmsi}", escapeHtml(this.config.mmsi ?? ""));
	},

	vesselName () {
		return this.config.vesselName || this.vessel?.name || `MMSI ${this.config.mmsi}`;
	},

	isStale () {
		const position = this.vessel?.position;
		return Boolean(position) && Date.now() - position.time > this.config.staleAfterMinutes * 60 * 1000;
	},

	getDom () {
		const wrapper = createElement("div", "vesseltracker");

		if (!this.config.mmsi) {
			wrapper.append(createElement("div", "dimmed small", this.translate("NO_MMSI")));
			return wrapper;
		}
		if (!this.loaded) {
			wrapper.append(createElement("div", "dimmed small", this.translate("LOADING")));
			return wrapper;
		}
		if (this.error) {
			wrapper.append(this.notice("fa-triangle-exclamation", this.translate(`${this.error.code}_TITLE`), this.translate(`${this.error.code}_TEXT`, { error: this.error.message ?? "" }), "vt-error"));
		}

		const position = this.vessel?.position;
		const name = this.vesselName();

		if (!position) {
			if (!this.error) {
				wrapper.append(Date.now() - this.startedAt < this.listeningGraceMs
					? this.notice("fa-satellite-dish", this.translate("LISTENING_TITLE"), this.translate("LISTENING_TEXT", { name }))
					: this.notice("fa-eye-slash", this.translate("UNAVAILABLE_TITLE"), this.translate("NEVER_SEEN_TEXT", { name })));
			}
			return wrapper;
		}

		const stale = this.isStale();
		const age = this.formatAge(Date.now() - position.time);
		if (stale) {
			const duration = this.formatAge(Date.now() - position.time, "DURATION");
			wrapper.append(this.notice("fa-eye-slash", this.translate("UNAVAILABLE_TITLE"), this.translate("UNAVAILABLE_TEXT", { name, duration })));
		}

		const details = createElement("div", stale ? "vt-details vt-stale" : "vt-details");
		const coordinates = createElement("div", "vt-coordinates bright medium");
		coordinates.append(
			createElement("span", "vt-lat", VesselTrackerFormat.formatCoordinate(position.lat, "lat", this.config.coordinateFormat)),
			createElement("span", "vt-lon", VesselTrackerFormat.formatCoordinate(position.lon, "lon", this.config.coordinateFormat))
		);
		details.append(coordinates);

		const meta = [];
		if (this.config.showSpeedAndCourse && !stale) {
			if (position.sog !== null) meta.push(`${position.sog.toFixed(1)} kn`);
			if (position.cog !== null) meta.push(`${Math.round(position.cog)}°`);
			const status = this.translate(`NAV_STATUS_${position.navStatus}`);
			if (position.navStatus !== null && status !== `NAV_STATUS_${position.navStatus}`) meta.push(status);
		}
		meta.push(this.translate(stale ? "LAST_SEEN" : "UPDATED", { age }));
		details.append(createElement("div", "vt-meta xsmall dimmed", meta.join(" · ")));

		const waterBody = this.vessel.waterBody;
		if (this.config.showWaterBody && waterBody?.name) {
			const text = waterBody.detail ? `${waterBody.name} · ${waterBody.detail}` : waterBody.name;
			details.append(this.line("fa-water", text));
		}

		if (this.config.showNearestCities && this.cities.length > 0) {
			const text = this.cities.map((city) => {
				const distance = VesselTrackerFormat.formatDistance(city.distanceKm, this.config.distanceUnit);
				const direction = this.translate(`COMPASS_${VesselTrackerFormat.compassPoint(city.bearing)}`);
				return `${city.name} ${distance} ${direction}`;
			}).join(" · ");
			details.append(this.line("fa-city", text));
		}

		if (this.config.showMap) details.append(this.mapElement);

		wrapper.append(details);
		return wrapper;
	},

	updateMap () {
		const position = this.vessel?.position;
		if (!this.config.showMap || !position || typeof L === "undefined" || !this.mapElement.isConnected) return;

		const latLng = [position.lat, position.lon];
		if (this.map) {
			this.map.invalidateSize();
			this.marker.setLatLng(latLng);
			this.map.setView(latLng, this.map.getZoom(), { animate: false });
		} else {
			this.map = L.map(this.mapElement, {
				zoomControl: false,
				dragging: false,
				scrollWheelZoom: false,
				doubleClickZoom: false,
				boxZoom: false,
				keyboard: false,
				touchZoom: false,
				fadeAnimation: false,
				zoomAnimation: false
			}).setView(latLng, this.config.mapZoom);
			this.map.attributionControl.setPrefix(false);
			// Leaflet fills "{key}" in mapTileUrl from the "key" option.
			L.tileLayer(this.config.mapTileUrl, { attribution: this.config.mapAttribution, key: this.mapApiKey, subdomains: "abcd", maxZoom: 19 }).addTo(this.map);
			this.marker = L.circleMarker(latLng, { radius: 6, weight: 2 }).addTo(this.map);
		}

		this.marker.setStyle(this.isStale()
			? { color: "#999", fillColor: "#555", fillOpacity: 0.8 }
			: { color: "#fff", fillColor: "#4fc3f7", fillOpacity: 1 });
	},

	// "AGE" gives "3 h ago", "DURATION" gives "3 h" (for "quiet for 3 h").
	formatAge (ms, prefix = "AGE") {
		const { key, count } = VesselTrackerFormat.ageParts(ms);
		return this.translate(key.replace("AGE_", `${prefix}_`), { count });
	},

	notice (icon, title, text, extraClass = "") {
		const notice = createElement("div", `vt-notice ${extraClass}`.trim());
		notice.append(createElement("i", `fa-solid ${icon}`));
		const body = createElement("div", "vt-notice-body");
		body.append(createElement("div", "vt-notice-title small bright", title), createElement("div", "vt-notice-text xsmall", text));
		notice.append(body);
		return notice;
	},

	line (icon, text) {
		const line = createElement("div", "vt-line small");
		line.append(createElement("i", `fa-solid ${icon}`), createElement("span", "", text));
		return line;
	}
});

/**
 * @param {unknown} value Value to insert into HTML.
 * @returns {string} Escaped text.
 */
function escapeHtml (value) {
	const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
	return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

/**
 * @param {string} tag Tag name.
 * @param {string} className CSS classes.
 * @param {string} [text] Text content.
 * @returns {HTMLElement} New element.
 */
function createElement (tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}
