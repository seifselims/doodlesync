import { expect, it } from "vitest";
import { DRAW_MAX_POINTS, drawOperationSchema } from "../src";

const validStroke = {
	type: "stroke",
	tool: "brush",
	color: "#1b1f3b",
	width: 0.012,
	points: [
		[0, 0],
		[0.5, 0.25],
		[1, 1],
	],
};

it.each([
	validStroke,
	{ ...validStroke, tool: "eraser" },
	{ ...validStroke, points: [[0.5, 0.5]] },
	{ ...validStroke, points: Array(DRAW_MAX_POINTS).fill([0.1, 0.2]) },
	{ type: "clear" },
])("accepts a drawing operation: %j", (operation) => {
	expect(drawOperationSchema.parse(operation)).toEqual(operation);
});

it.each([
	{ ...validStroke, points: [] },
	{ ...validStroke, points: Array(DRAW_MAX_POINTS + 1).fill([0.1, 0.2]) },
	{ ...validStroke, points: [[1.1, 0.5]] },
	{ ...validStroke, points: [[0.5, -0.1]] },
	{ ...validStroke, points: [[0.5]] },
	{ ...validStroke, points: [[0.5, 0.5, 0.5]] },
	{ ...validStroke, width: 0 },
	{ ...validStroke, width: 5 },
	{ ...validStroke, color: "red" },
	{ ...validStroke, color: "#FFFFFF" },
	{ ...validStroke, tool: "fill" },
	{ ...validStroke, playerId: "user-1" },
	{ type: "clear", everyone: true },
	{ type: "undo" },
])("rejects an invalid drawing operation: %j", (operation) => {
	expect(drawOperationSchema.safeParse(operation).success).toBe(false);
});
