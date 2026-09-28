import { z } from "zod";
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
]);

export type ClientCommand = z.infer<typeof clientCommandSchema>;
