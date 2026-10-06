import type {
	ChatMessage,
	DrawOperation,
	PlayerSnapshot,
	RoomSettings,
} from "@doodlesync/shared";
export type RoomState = {
	code: string;
	hostId: string | null;
	status: "LOBBY";
	settings: RoomSettings;
	players: Map<string, PlayerSnapshot>;
	emptySince: number | null;
	chat: ChatMessage[];
	// Operations since the last clear; replaying them rebuilds the canvas.
	drawing: DrawOperation[];
	drawingPoints: number;
};
