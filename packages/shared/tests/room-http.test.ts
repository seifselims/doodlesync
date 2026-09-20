import { expect, it } from "vitest";
import { createRoomInputSchema } from "../src";
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
