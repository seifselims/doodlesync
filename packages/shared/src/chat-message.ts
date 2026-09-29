import { z } from "zod";

export const CHAT_MESSAGE_MAX_LENGTH = 200;
// Recent messages a room keeps and sends to a player when they connect.
export const CHAT_HISTORY_LIMIT = 50;

// Built by the server: author and time come from the session and server clock.
export const chatMessageSchema = z.strictObject({
	id: z.string().min(1),
	authorId: z.string().min(1),
	authorName: z.string().min(1),
	text: z.string().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
	// Milliseconds since the Unix epoch.
	sentAt: z.number().int().nonnegative(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
