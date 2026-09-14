const fs = require("node:fs");
const path = require("node:path");

/**
 * Persists vessel state to disk so the last known position survives restarts.
 * A vessel that has switched off its transponder never sends a new message,
 * so this file is the only source of its last position after a restart.
 */
class StateStore {
	constructor (file, { writeDelayMs = 60 * 1000, onError = () => {} } = {}) {
		this.file = file;
		this.writeDelayMs = writeDelayMs;
		this.onError = onError;
		this.timer = null;
		this.getData = null;
	}

	/**
	 * @returns {object} Stored data, or an empty object if missing or corrupt.
	 */
	load () {
		try {
			return JSON.parse(fs.readFileSync(this.file, "utf8"));
		} catch {
			return {};
		}
	}

	/**
	 * Schedules a throttled write.
	 * @param {Function} getData Returns the data to write at write time.
	 */
	scheduleSave (getData) {
		this.getData = getData;
		if (this.timer) return;
		this.timer = setTimeout(() => this.flush(), this.writeDelayMs);
	}

	/**
	 * Writes pending data immediately (atomic via rename).
	 * On failure the data stays pending and is retried with the next scheduled save.
	 * @returns {boolean} False if the write failed.
	 */
	flush () {
		clearTimeout(this.timer);
		this.timer = null;
		if (!this.getData) return true;
		try {
			fs.mkdirSync(path.dirname(this.file), { recursive: true });
			const tempFile = `${this.file}.tmp`;
			fs.writeFileSync(tempFile, JSON.stringify(this.getData(), null, "\t"));
			fs.renameSync(tempFile, this.file);
			this.getData = null;
			return true;
		} catch (error) {
			this.onError(error);
			return false;
		}
	}
}

module.exports = { StateStore };
