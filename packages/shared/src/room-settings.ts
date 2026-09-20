import { z } from "zod";

// Initial product limits; durations are measured in seconds.
export const roomSettingsSchema = z.strictObject({
	maxPlayers: z.number().int().min(2).max(12),
	rounds: z.number().int().min(1).max(10),
	drawTimeSeconds: z.number().int().min(30).max(180),
});

export type RoomSettings = z.infer<typeof roomSettingsSchema>;
