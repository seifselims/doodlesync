import { expect, it } from "vitest";
import { clientCommandSchema } from "../src";
import { validSettings } from "./fixtures";

it.each([
	{ type: "room:join", code: "ABC123" },
	{ type: "room:leave" },
	{ type: "room:update-settings", settings: validSettings },
])("accepts a supported command: %j", (command) => {
	expect(clientCommandSchema.parse(command)).toEqual(command);
});
it("trims the join code", () => {
	expect(
		clientCommandSchema.parse({ type: "room:join", code: " ABC123 " }),
	).toEqual({ type: "room:join", code: "ABC123" });
});
it.each([
	null,
	{},
	{ type: "unknown" },
	{ type: "room:join" },
	{ type: "room:join", code: "   " },
	{ type: "room:join", code: 123 },
	{ type: "room:join", code: "ABC123", playerId: "another-user" },
	{ type: "room:leave", playerId: "another-user" },
	{ type: "room:update-settings" },
	{ type: "room:update-settings", settings: {} },
	{ type: "room:update-settings", settings: { ...validSettings, rounds: 0 } },
	{ type: "room:update-settings", settings: validSettings, isHost: true },
])("rejects an invalid command: %j", (command) => {
	expect(clientCommandSchema.safeParse(command).success).toBe(false);
});
