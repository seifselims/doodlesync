import { expect, it } from "vitest";
import { CHAT_MESSAGE_MAX_LENGTH, chatMessageSchema } from "../src";

const validMessage = {
	id: "message-1",
	authorId: "user-1",
	authorName: "Ada",
	text: "hello",
	sentAt: 1_700_000_000_000,
};

it.each([
	validMessage,
	{ ...validMessage, text: "a".repeat(CHAT_MESSAGE_MAX_LENGTH) },
	{ ...validMessage, sentAt: 0 },
])("accepts a server-built chat message: %j", (message) => {
	expect(chatMessageSchema.parse(message)).toEqual(message);
});

it.each([
	{ ...validMessage, text: "" },
	{ ...validMessage, text: "a".repeat(201) },
	{ ...validMessage, authorId: "" },
	{ ...validMessage, authorName: "" },
	{ ...validMessage, id: "" },
	{ ...validMessage, sentAt: -1 },
	{ ...validMessage, sentAt: 1.5 },
	{ ...validMessage, sentAt: "2026-09-29T12:00:00Z" },
	{ ...validMessage, isHost: true },
])("rejects an invalid chat message: %j", (message) => {
	expect(chatMessageSchema.safeParse(message).success).toBe(false);
});
