import { expect, it } from "vitest";
import { playerSnapshotSchema, roomSnapshotSchema } from "../src";
import { validSnapshot } from "./fixtures";

it("accepts a public lobby snapshot", () => {
	expect(roomSnapshotSchema.parse(validSnapshot)).toEqual(validSnapshot);
});
it.each([
	{ code: "" },
	{ hostId: "" },
	{ settings: {} },
	{ players: ["Seif"] },
	{ secretWord: "elephant" },
	{ players: [{ id: "user-1", name: "Seif", email: "private@example.com" }] },
])("rejects malformed or private snapshot data: %j", (changes) => {
	expect(
		roomSnapshotSchema.safeParse({ ...validSnapshot, ...changes }).success,
	).toBe(false);
});
it.each(["code", "hostId", "settings", "players"])("requires %s", (field) => {
	expect(
		roomSnapshotSchema.safeParse({ ...validSnapshot, [field]: undefined })
			.success,
	).toBe(false);
});
it.each([
	{},
	{ id: "", name: "Seif" },
	{ id: "user-1", name: "" },
	{ id: 123, name: "Seif" },
	{ id: "user-1", name: 123 },
	{ id: "user-1", name: "Seif", sessionToken: "private" },
])("rejects invalid player data: %j", (player) => {
	expect(playerSnapshotSchema.safeParse(player).success).toBe(false);
});
it.each([12, 13])(
	"checks the snapshot player limit with %i players",
	(count) => {
		const players = Array.from({ length: count }, (_, index) => ({
			id: `user-${index + 1}`,
			name: `Player ${index + 1}`,
		}));
		expect(
			roomSnapshotSchema.safeParse({
				...validSnapshot,
				settings: { ...validSnapshot.settings, maxPlayers: 12 },
				players,
			}).success,
		).toBe(count === 12);
	},
);
