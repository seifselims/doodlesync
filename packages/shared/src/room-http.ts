import { z } from "zod";
import { roomSettingsSchema } from "./room-settings";

export const createRoomInputSchema = z.strictObject({
	settings: roomSettingsSchema,
});

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;

// Response of `GET /api/rooms/current`: the caller's active room, if any.
export const currentRoomSchema = z.strictObject({
	code: z.string().min(1).nullable(),
});

export type CurrentRoom = z.infer<typeof currentRoomSchema>;
