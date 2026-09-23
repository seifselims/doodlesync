import type { PlayerSnapshot, RoomSettings } from "@doodlesync/shared";
export type RoomState = {
	code: string;
	hostId: string | null;
	status: "LOBBY";
	settings: RoomSettings;
	players: Map<string, PlayerSnapshot>;
	emptySince: number | null;
};
