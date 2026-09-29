import { expect, it } from "vitest";
import { CHAT_MESSAGE_MAX_LENGTH, clientCommandSchema } from "../src";
import { validSettings } from "./fixtures";

it.each([
	{ type: "room:leave" },
	{ type: "room:update-settings", settings: validSettings },
])("accepts a supported command: %j", (command) => {
	expect(clientCommandSchema.parse(command)).toEqual(command);
});
it.each([
	null,
	{},
	{ type: "unknown" },
	{ type: "room:join", code: "ABC123" },
	{ type: "room:leave", playerId: "another-user" },
	{ type: "room:update-settings" },
	{ type: "room:update-settings", settings: {} },
	{ type: "room:update-settings", settings: { ...validSettings, rounds: 0 } },
	{ type: "room:update-settings", settings: validSettings, isHost: true },
])("rejects an invalid command: %j", (command) => {
	expect(clientCommandSchema.safeParse(command).success).toBe(false);
});

it.each([
	{ text: "hi", parsed: "hi" },
	{ text: "  hello there  ", parsed: "hello there" },
	{ text: "a".repeat(CHAT_MESSAGE_MAX_LENGTH), parsed: "a".repeat(200) },
])("accepts and trims chat text: %j", ({ text, parsed }) => {
	expect(clientCommandSchema.parse({ type: "chat:send", text })).toEqual({
		type: "chat:send",
		text: parsed,
	});
});

it("counts the length limit after trimming", () => {
	const text = ` ${"a".repeat(CHAT_MESSAGE_MAX_LENGTH)} `;
	expect(
		clientCommandSchema.safeParse({ type: "chat:send", text }).success,
	).toBe(true);
});

it.each([
	{ type: "chat:send" },
	{ type: "chat:send", text: "" },
	{ type: "chat:send", text: "   " },
	{ type: "chat:send", text: "\n\t " },
	{ type: "chat:send", text: "a".repeat(201) },
	{ type: "chat:send", text: 42 },
	{ type: "chat:send", text: "hi", authorId: "another-user" },
	{ type: "chat:send", text: "hi", authorName: "Someone Else" },
	{ type: "chat:send", text: "hi", sentAt: 0 },
	{ type: "chat:send", text: "hi", id: "forged-id" },
	{ type: "chat: send", text: "hi" },
])("rejects an invalid chat command: %j", (command) => {
	expect(clientCommandSchema.safeParse(command).success).toBe(false);
});
