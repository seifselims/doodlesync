import { expect, it } from "vitest";
import { roomCodeSchema } from "../src";

it("normalizes a code by trimming and uppercasing it", () => {
	expect(roomCodeSchema.parse(" k7pq2a ")).toBe("K7PQ2A");
});

it.each(["", "ABC12", "ABC2345", "ABC-23", "ABC100", 123456])(
	"rejects an invalid code: %j",
	(code) => {
		expect(roomCodeSchema.safeParse(code).success).toBe(false);
	},
);
