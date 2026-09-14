// Real messages captured from aisstream.io on 2026-09-14.
module.exports = {
	positionReport: {
		MetaData: { MMSI: 211512280, MMSI_String: 211512280, ShipName: "PAULINE ABICHT      ", latitude: 53.52818, longitude: 10.05414, time_utc: "2026-09-14 17:16:02.550563014 +0000 UTC" },
		MessageType: "PositionReport",
		Message: {
			PositionReport: { MessageID: 3, RepeatIndicator: 0, UserID: 211512280, Valid: true, NavigationalStatus: 0, RateOfTurn: -128, Sog: 0, PositionAccuracy: false, Longitude: 10.054136666666666, Latitude: 53.52818166666667, Cog: 0, TrueHeading: 511, Timestamp: 1, SpecialManoeuvreIndicator: 0, Spare: 0, Raim: false, CommunicationState: 11841 }
		}
	},
	classBPositionReport: {
		MetaData: { MMSI: 219022289, MMSI_String: 219022289, ShipName: "MUDDI", latitude: 55.32728, longitude: 11.1314, time_utc: "2026-09-14 17:16:02.619951541 +0000 UTC" },
		MessageType: "StandardClassBPositionReport",
		Message: {
			StandardClassBPositionReport: { AssignedMode: false, ClassBBand: true, ClassBDisplay: false, ClassBDsc: true, ClassBMsg22: true, ClassBUnit: true, Cog: 158.9, CommunicationState: 393222, CommunicationStateIsItdma: true, Latitude: 55.327275, Longitude: 11.131395, MessageID: 18, PositionAccuracy: true, Raim: true, RepeatIndicator: 0, Sog: 102.3, Spare1: 0, Spare2: 0, Timestamp: 1, TrueHeading: 511, UserID: 219022289, Valid: true }
		}
	},
	shipStaticData: {
		MetaData: { MMSI: 211778450, MMSI_String: 211778450, ShipName: "TWIELENFLETH", latitude: 53.43066, longitude: 10.35461, time_utc: "2026-09-14 17:16:03.209458565 +0000 UTC" },
		MessageType: "ShipStaticData",
		Message: {
			ShipStaticData: { AisVersion: 2, CallSign: "DK8241", Destination: "DOKKERBANK._.@@@@", Dimension: { A: 10, B: 20, C: 2, D: 7 }, Dte: false, Eta: { Day: 21, Hour: 15, Minute: 15, Month: 9 }, FixType: 1, ImoNumber: 0, MaximumStaticDraught: 0, MessageID: 5, Name: "TWIELENFLETH", RepeatIndicator: 0, Spare: false, Type: 99, UserID: 211778450, Valid: true }
		}
	},
	// Marine Regions records for a point in the Strait of Hormuz (26.5 N, 56.3 E), trimmed.
	hormuzRecords: [
		{ placeType: "Strait", preferredGazetteerName: "Strait of Hormuz", minLatitude: 25.27, minLongitude: 55.16, maxLatitude: 27.37, maxLongitude: 57.34 },
		{ placeType: "IHO Sea Area", preferredGazetteerName: "Persian Gulf", minLatitude: 23.96, minLongitude: 47.7, maxLatitude: 31.19, maxLongitude: 57.34 },
		{ placeType: "IHO Sea Area", preferredGazetteerName: "Indian Ocean", minLatitude: -60, minLongitude: 20, maxLatitude: 31.19, maxLongitude: 146.9 },
		{ placeType: "IHO Sea Area", preferredGazetteerName: "Gulf of Iran", minLatitude: 23.96, minLongitude: 47.7, maxLatitude: 31.19, maxLongitude: 57.34 },
		{ placeType: "General Sea Area", preferredGazetteerName: "Indo-Pacific Ocean", minLatitude: -35, minLongitude: -25, maxLatitude: 32, maxLongitude: 28 }
	]
};
