import {
	DRAW_HISTORY_MAX_POINTS,
	DRAW_MAX_POINTS,
	type DrawOperation,
	type DrawPoint,
} from "@doodlesync/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateRoomCode } from "./room-code";
import { RoomService } from "./room-service";

vi.mock("./room-code", () => ({ generateRoomCode: vi.fn() }));

const generateCode = vi.mocked(generateRoomCode);
const host = { id: "host", name: "Host" };
const guest = { id: "guest", name: "Guest" };
const outsider = { id: "outsider", name: "Outsider" };
const settings = { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 };

function stroke(
	pointCount: number,
	color = "#000000",
): Extract<DrawOperation, { type: "stroke" }> {
	const points: DrawPoint[] = Array.from({ length: pointCount }, (_, i) => [
		(i % 100) / 100,
		0.5,
	]);
	return { type: "stroke", tool: "brush", color, width: 0.012, points };
}

const clear: DrawOperation = { type: "clear" };

function firstPoint(points: DrawPoint[]): DrawPoint {
	const [point] = points;
	if (!point) throw new Error("Expected a point");
	return point;
}

function setup() {
	const service = new RoomService();
	const room = service.createRoom(host, { settings });
	service.joinRoom(guest, room.code);
	return { service, code: room.code };
}

// Fills the canvas with full-size strokes up to `total` points.
function fill(
	service: RoomService,
	code: string,
	total: number,
	playerId = host.id,
) {
	let remaining = total;
	while (remaining > 0) {
		const size = Math.min(DRAW_MAX_POINTS, remaining);
		service.applyDrawOperation(playerId, code, stroke(size));
		remaining -= size;
	}
}

function pointCount(operations: DrawOperation[]) {
	return operations.reduce(
		(sum, operation) =>
			sum + (operation.type === "stroke" ? operation.points.length : 0),
		0,
	);
}

describe("RoomService drawing history", () => {
	beforeEach(() => {
		generateCode.mockReset();
		generateCode.mockReturnValue("ABC234");
	});

	it("starts empty for every member", () => {
		const { service, code } = setup();
		expect(service.getDrawingHistory(host.id, code)).toEqual([]);
		expect(service.getDrawingHistory(guest.id, code)).toEqual([]);
	});

	it("stores strokes oldest first", () => {
		const { service, code } = setup();
		const first = stroke(2, "#ff0000");
		const second = stroke(3, "#00ff00");
		const third = { ...stroke(1, "#0000ff"), tool: "eraser" as const };
		for (const operation of [first, second, third]) {
			service.applyDrawOperation(host.id, code, operation);
		}
		expect(service.getDrawingHistory(guest.id, code)).toEqual([
			first,
			second,
			third,
		]);
	});

	it("empties the history on clear and keeps strokes drawn after it", () => {
		const { service, code } = setup();
		service.applyDrawOperation(host.id, code, stroke(2, "#ff0000"));
		service.applyDrawOperation(host.id, code, stroke(2, "#00ff00"));
		expect(service.applyDrawOperation(host.id, code, clear)).toEqual(clear);
		expect(service.getDrawingHistory(guest.id, code)).toEqual([]);

		const after = stroke(4, "#123abc");
		service.applyDrawOperation(host.id, code, after);
		expect(service.getDrawingHistory(guest.id, code)).toEqual([after]);
	});

	it("stores a copy of the input operation", () => {
		const { service, code } = setup();
		const input = stroke(2, "#ff0000");
		const expected = structuredClone(input);
		service.applyDrawOperation(host.id, code, input);

		input.color = "#ffffff";
		input.points.push([1, 1]);
		firstPoint(input.points)[0] = 0.99;
		expect(service.getDrawingHistory(host.id, code)).toEqual([expected]);
	});

	it("returns copies that do not change the stored history", () => {
		const { service, code } = setup();
		const input = stroke(2, "#ff0000");
		const returned = service.applyDrawOperation(host.id, code, input);
		const history = service.getDrawingHistory(host.id, code);

		if (returned.type !== "stroke") throw new Error("Expected a stroke");
		firstPoint(returned.points)[1] = 0.01;
		history.push(clear);
		const [stored] = history;
		if (stored?.type !== "stroke") throw new Error("Expected a stroke");
		firstPoint(stored.points)[0] = 0.77;
		stored.points.pop();
		stored.width = 0.05;

		expect(service.getDrawingHistory(host.id, code)).toEqual([input]);
	});

	it("rejects history reads from nonmembers", () => {
		const { service, code } = setup();
		service.applyDrawOperation(host.id, code, stroke(2));
		expect(() => service.getDrawingHistory(outsider.id, code)).toThrow(
			expect.objectContaining({ code: "NOT_IN_ROOM" }),
		);

		service.leaveRoom(guest, code);
		expect(() => service.getDrawingHistory(guest.id, code)).toThrow(
			expect.objectContaining({ code: "NOT_IN_ROOM" }),
		);
	});

	it("accepts exactly the point budget and rejects one more point without dropping strokes", () => {
		const { service, code } = setup();
		fill(service, code, DRAW_HISTORY_MAX_POINTS);
		const full = service.getDrawingHistory(host.id, code);
		expect(pointCount(full)).toBe(DRAW_HISTORY_MAX_POINTS);

		expect(() =>
			service.applyDrawOperation(host.id, code, stroke(1, "#ff0000")),
		).toThrow(expect.objectContaining({ code: "CANVAS_FULL" }));
		expect(service.getDrawingHistory(host.id, code)).toEqual(full);
	});

	it("rejects a stroke that would cross the budget even when fewer points would fit", () => {
		const { service, code } = setup();
		fill(service, code, DRAW_HISTORY_MAX_POINTS - 10);
		const before = service.getDrawingHistory(host.id, code);

		expect(() => service.applyDrawOperation(host.id, code, stroke(11))).toThrow(
			expect.objectContaining({ code: "CANVAS_FULL" }),
		);
		expect(service.getDrawingHistory(host.id, code)).toEqual(before);
		// The rejected stroke did not consume budget: exactly 10 points still fit.
		service.applyDrawOperation(host.id, code, stroke(10));
		expect(pointCount(service.getDrawingHistory(host.id, code))).toBe(
			DRAW_HISTORY_MAX_POINTS,
		);
	});

	it("resets the point budget on clear", () => {
		const { service, code } = setup();
		fill(service, code, DRAW_HISTORY_MAX_POINTS);
		service.applyDrawOperation(host.id, code, clear);

		fill(service, code, DRAW_HISTORY_MAX_POINTS);
		expect(pointCount(service.getDrawingHistory(host.id, code))).toBe(
			DRAW_HISTORY_MAX_POINTS,
		);
		expect(() => service.applyDrawOperation(host.id, code, stroke(1))).toThrow(
			expect.objectContaining({ code: "CANVAS_FULL" }),
		);
	});

	it("keeps each room's drawing separate", () => {
		generateCode.mockReturnValueOnce("AAA222").mockReturnValueOnce("BBB333");
		const service = new RoomService();
		const first = service.createRoom(host, { settings });
		const second = service.createRoom(outsider, { settings });
		const inFirst = stroke(2, "#ff0000");
		const inSecond = stroke(3, "#00ff00");
		service.applyDrawOperation(host.id, first.code, inFirst);
		service.applyDrawOperation(outsider.id, second.code, inSecond);

		expect(service.getDrawingHistory(host.id, first.code)).toEqual([inFirst]);
		expect(service.getDrawingHistory(outsider.id, second.code)).toEqual([
			inSecond,
		]);

		service.applyDrawOperation(host.id, first.code, clear);
		expect(service.getDrawingHistory(host.id, first.code)).toEqual([]);
		expect(service.getDrawingHistory(outsider.id, second.code)).toEqual([
			inSecond,
		]);
	});

	it("starts a reused code from an expired room with an empty drawing", () => {
		let now = 1_000;
		const service = new RoomService({ now: () => now, emptyRoomTtlMs: 5_000 });
		const room = service.createRoom(host, { settings });
		fill(service, room.code, DRAW_HISTORY_MAX_POINTS);
		service.leaveRoom(host, room.code);
		now += 5_000;

		const reused = service.createRoom(guest, { settings });
		expect(reused.code).toBe(room.code);
		expect(service.getDrawingHistory(guest.id, reused.code)).toEqual([]);
		// The full canvas of the expired room does not use up the new budget.
		fill(service, reused.code, DRAW_HISTORY_MAX_POINTS, guest.id);
		expect(pointCount(service.getDrawingHistory(guest.id, reused.code))).toBe(
			DRAW_HISTORY_MAX_POINTS,
		);
	});
});
