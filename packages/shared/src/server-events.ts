import { z } from "zod";
import { CHAT_HISTORY_LIMIT, chatMessageSchema } from "./chat-message";
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
	z.strictObject({
		type: z.literal("chat:message"),
		message: chatMessageSchema,
	}),
	// Sent only to the connecting socket, oldest message first.
	z.strictObject({
		type: z.literal("chat:history"),
		messages: z.array(chatMessageSchema).max(CHAT_HISTORY_LIMIT),
	}),
]);

export type ServerEvent = z.infer<typeof serverEventsSchema>;
