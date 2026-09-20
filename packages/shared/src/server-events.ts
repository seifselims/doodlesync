import { z } from "zod";
import { errorSchema } from "./error-schema";
import { roomSnapshotSchema } from "./room-snapshot";

export const serverEventsSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("room:snapshot"),
		snapshot: roomSnapshotSchema,
	}),
	z.strictObject({
		type: z.literal("room:left"),
	}),
	z.strictObject({
		type: z.literal("error"),
		error: errorSchema,
	}),
]);

export type ServerEvent = z.infer<typeof serverEventsSchema>;
