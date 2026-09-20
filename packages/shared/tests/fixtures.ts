import type { RoomSettings, RoomSnapshot } from "../src";

export const validSettings: RoomSettings = {
	maxPlayers: 8,
	rounds: 3,
	drawTimeSeconds: 60,
};
export const validSnapshot: RoomSnapshot = {
	code: "ABC123",
	hostId: "user-1",
	settings: validSettings,
	players: [{ id: "user-1", name: "Seif" }],
};
