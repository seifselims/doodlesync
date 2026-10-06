import { describe, expect, it } from "vitest";
import {
	clientCommandSchema,
	errorCodeSchema,
	errorSchema,
	serverEventsSchema,
} from "../src";

const stroke = {
	type: "stroke",
	tool: "brush",
	color: "#1b1f3b",
	width: 0.012,
	points: [
		[0.1, 0.2],
		[0.3, 0.4],
	],
};
const clear = { type: "clear" };
const badStroke = { ...stroke, color: "red" };

describe("draw client command", () => {
	it.each([stroke, clear])(
		"accepts a draw command with operation %j",
		(operation) => {
			const command = { type: "draw", operation };
			expect(clientCommandSchema.parse(command)).toEqual(command);
		},
	);

	it.each([
		["missing operation", { type: "draw" }],
		["null operation", { type: "draw", operation: null }],
		["invalid stroke", { type: "draw", operation: badStroke }],
		["unknown operation type", { type: "draw", operation: { type: "undo" } }],
		[
			"forged player id",
			{ type: "draw", operation: stroke, playerId: "another-user" },
		],
		["drawer flag", { type: "draw", operation: clear, isDrawer: true }],
		["operation at top level", { ...stroke, type: "draw" }],
	])("rejects %s", (_label, command) => {
		expect(clientCommandSchema.safeParse(command).success).toBe(false);
	});
});

describe("drawing server events", () => {
	it.each([
		{ type: "draw:operation", operation: stroke },
		{ type: "draw:operation", operation: clear },
		{ type: "draw:history", operations: [] },
		{ type: "draw:history", operations: [stroke, clear, stroke] },
	])("accepts %j", (event) => {
		expect(serverEventsSchema.parse(event)).toEqual(event);
	});

	it.each([
		["missing operation", { type: "draw:operation" }],
		["invalid operation", { type: "draw:operation", operation: badStroke }],
		[
			"extra field on operation event",
			{ type: "draw:operation", operation: stroke, playerId: "host" },
		],
		["missing operations", { type: "draw:history" }],
		[
			"invalid operation in history",
			{ type: "draw:history", operations: [stroke, badStroke] },
		],
		["non-array history", { type: "draw:history", operations: stroke }],
		[
			"extra field on history event",
			{ type: "draw:history", operations: [], complete: true },
		],
	])("rejects %s", (_label, event) => {
		expect(serverEventsSchema.safeParse(event).success).toBe(false);
	});
});

describe("canvas full error", () => {
	it("accepts the CANVAS_FULL code in an error event", () => {
		expect(errorCodeSchema.parse("CANVAS_FULL")).toBe("CANVAS_FULL");
		const event = {
			type: "error",
			error: { code: "CANVAS_FULL", message: "The canvas is full." },
		};
		expect(serverEventsSchema.parse(event)).toEqual(event);
		expect(errorSchema.safeParse(event.error).success).toBe(true);
	});
});
