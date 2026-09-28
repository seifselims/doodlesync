import { expect, it } from "vitest";
import { createRoomInputSchema, currentRoomSchema } from "../src";
import { validSettings } from "./fixtures";

it("accepts room creation settings", () => {
	const body = { settings: validSettings };
	expect(createRoomInputSchema.parse(body)).toEqual(body);
});
it.each([
	null,
	{},
	{ settings: {} },
	{ settings: null },
	{ settings: { ...validSettings, rounds: 0 } },
	{ settings: validSettings, hostId: "another-user" },
	{ settings: validSettings, code: "MYCODE" },
])("rejects an invalid create-room request: %j", (body) => {
	expect(createRoomInputSchema.safeParse(body).success).toBe(false);
});

it.each([{ code: "K7PQ2A" }, { code: null }])(
	"accepts a current-room response: %j",
	(body) => {
		expect(currentRoomSchema.parse(body)).toEqual(body);
	},
);

it.each([{}, { code: "" }, { code: "K7PQ2A", hostId: "x" }])(
	"rejects an invalid current-room response: %j",
	(body) => {
		expect(currentRoomSchema.safeParse(body).success).toBe(false);
	},
);
