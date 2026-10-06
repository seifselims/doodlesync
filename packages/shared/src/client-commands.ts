import { z } from "zod";
import { CHAT_MESSAGE_MAX_LENGTH } from "./chat-message";
import { drawOperationSchema } from "./drawing";
import { roomSettingsSchema } from "./room-settings";

// Joining happens over HTTP (`POST /api/rooms/:code/join`) before the socket opens.
export const clientCommandSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("room:leave"),
	}),
	z.strictObject({
		type: z.literal("room:update-settings"),
		settings: roomSettingsSchema,
	}),
	z.strictObject({
		type: z.literal("chat:send"),
		text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
	}),
	// Only the host may draw in the multiplayer prototype; the server checks.
	z.strictObject({
		type: z.literal("draw"),
		operation: drawOperationSchema,
	}),
]);

export type ClientCommand = z.infer<typeof clientCommandSchema>;
