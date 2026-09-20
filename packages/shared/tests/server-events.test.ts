import { expect, it } from "vitest";
import { serverEventsSchema } from "../src";
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
