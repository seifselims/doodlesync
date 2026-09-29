import { expect, it } from "vitest";
import { CHAT_HISTORY_LIMIT, serverEventsSchema } from "../src";
import { validSnapshot } from "./fixtures";

it.each([
	{ type: "room:snapshot", snapshot: validSnapshot },
	{ type: "room:left" },
	{
		type: "error",
		error: { code: "ROOM_FULL", message: "This room is full." },
	},
])("accepts a supported event: %j", (event) => {
	expect(serverEventsSchema.parse(event)).toEqual(event);
});
it.each([
	null,
	{},
	{ type: "unknown" },
	{ type: "room:snapshot" },
	{ type: "room:snapshot", snapshot: {} },
	{
		type: "room:snapshot",
		snapshot: { ...validSnapshot, secretWord: "elephant" },
	},
	{ type: "room:left", unexpected: true },
	{ type: "error" },
	{
		type: "error",
		error: { code: "UNKNOWN_ERROR", message: "Something failed." },
	},
])("rejects an invalid event: %j", (event) => {
	expect(serverEventsSchema.safeParse(event).success).toBe(false);
});

const chatMessage = {
	id: "message-1",
	authorId: "user-1",
	authorName: "Ada",
	text: "hello",
	sentAt: 1_700_000_000_000,
};

it.each([
	{ type: "chat:message", message: chatMessage },
	{ type: "chat:history", messages: [] },
	{
		type: "chat:history",
		messages: Array.from({ length: CHAT_HISTORY_LIMIT }, (_, i) => ({
			...chatMessage,
			id: `message-${i}`,
		})),
	},
])("accepts a chat event: %j", (event) => {
	expect(serverEventsSchema.parse(event)).toEqual(event);
});

it.each([
	{ type: "chat:message" },
	{ type: "chat:message", message: { ...chatMessage, text: "" } },
	{ type: "chat:history" },
	{ type: "chat:history", messages: chatMessage },
	{ type: "chat:history", messages: [{ ...chatMessage, sentAt: "now" }] },
	{
		type: "chat:history",
		messages: Array(CHAT_HISTORY_LIMIT + 1).fill(chatMessage),
	},
	{ type: "chat:history", messages: [], roomCode: "ABC234" },
])("rejects an invalid chat event: %j", (event) => {
	expect(serverEventsSchema.safeParse(event).success).toBe(false);
});
