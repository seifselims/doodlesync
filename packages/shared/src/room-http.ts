import { z } from "zod";
import { roomSettingsSchema } from "./room-settings";

export const createRoomInputSchema = z.strictObject({
	settings: roomSettingsSchema,
});

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
