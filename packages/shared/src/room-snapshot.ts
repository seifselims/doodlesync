import { z } from "zod";
import { roomSettingsSchema } from "./room-settings";

export const playerSnapshotSchema = z.strictObject({
	id: z.string().min(1),
	name: z.string().min(1),
});

export const roomSnapshotSchema = z.strictObject({
	code: z.string().min(1),
	hostId: z.string().min(1),
	settings: roomSettingsSchema,
	players: z.array(playerSnapshotSchema).max(12),
});

export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
