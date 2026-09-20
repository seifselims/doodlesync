import { expect, it } from "vitest";
import { errorCodeSchema, errorSchema } from "../src";

it.each([
	"INVALID_INPUT",
	"UNAUTHENTICATED",
	"ROOM_NOT_FOUND",
	"ROOM_FULL",
	"NOT_HOST",
	"NOT_IN_ROOM",
])("accepts stable error code %s", (code) => {
	expect(errorCodeSchema.parse(code)).toBe(code);
	const error = { code, message: "The request could not be completed." };
	expect(errorSchema.parse(error)).toEqual(error);
});
it.each([
	null,
	{},
	{ message: "Failed" },
	{ code: "UNKNOWN_ERROR", message: "Failed" },
	{ code: "ROOM_FULL" },
	{ code: "ROOM_FULL", message: "" },
	{ code: "ROOM_FULL", message: 123 },
	{ code: "ROOM_FULL", message: "Full", stack: "internal details" },
])("rejects an invalid error: %j", (error) => {
	expect(errorSchema.safeParse(error).success).toBe(false);
});
