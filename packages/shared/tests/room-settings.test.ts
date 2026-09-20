import { expect, it } from "vitest";
import { roomSettingsSchema } from "../src";
import { validSettings } from "./fixtures";

it.each([
	validSettings,
	{ maxPlayers: 2, rounds: 1, drawTimeSeconds: 30 },
	{ maxPlayers: 12, rounds: 10, drawTimeSeconds: 180 },
])("accepts valid settings: %j", (settings) => {
	expect(roomSettingsSchema.parse(settings)).toEqual(settings);
});

it.each([
	["maxPlayers", 1],
	["maxPlayers", 13],
	["maxPlayers", 2.5],
	["rounds", 0],
	["rounds", 11],
	["rounds", 1.5],
	["drawTimeSeconds", 29],
	["drawTimeSeconds", 181],
	["drawTimeSeconds", 30.5],
])("rejects invalid %s: %j", (field, value) => {
	expect(
		roomSettingsSchema.safeParse({ ...validSettings, [field as string]: value })
			.success,
	).toBe(false);
});

for (const field of ["maxPlayers", "rounds", "drawTimeSeconds"] as const) {
	it.each([undefined, null, "3", true, Number.NaN, Number.POSITIVE_INFINITY])(
		`rejects missing or nonnumeric ${field}: %j`,
		(value) => {
			expect(
				roomSettingsSchema.safeParse({ ...validSettings, [field]: value })
					.success,
			).toBe(false);
		},
	);
}
it("rejects unexpected settings", () => {
	expect(
		roomSettingsSchema.safeParse({ ...validSettings, isHost: true }).success,
	).toBe(false);
});
