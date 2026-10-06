import type { DrawOperation } from "@doodlesync/shared";
import { describe, expect, it } from "vitest";
import { RoomError } from "./room-error";
import { RoomService } from "./room-service";

const host = { id: "host", name: "Host" };
const guest = { id: "guest", name: "Guest" };
const third = { id: "third", name: "Third" };
const outsider = { id: "outsider", name: "Outsider" };
const settings = { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 };

const stroke: DrawOperation = {
	type: "stroke",
	tool: "brush",
	color: "#112233",
	width: 0.012,
	points: [
		[0.1, 0.2],
		[0.3, 0.4],
	],
};
const clear: DrawOperation = { type: "clear" };

function setup() {
	const service = new RoomService();
	const room = service.createRoom(host, { settings });
	service.joinRoom(guest, room.code);
	service.joinRoom(third, room.code);
	return { service, code: room.code };
}

function expectRoomError(action: () => unknown, code: string) {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(RoomError);
	expect(caught).toMatchObject({ code });
}

describe("drawing permissions (prototype: only the host draws)", () => {
	it("lets the host draw and clear", () => {
		const { service, code } = setup();
		expect(service.applyDrawOperation(host.id, code, stroke)).toEqual(stroke);
		expect(service.getDrawingHistory(guest.id, code)).toEqual([stroke]);
		expect(service.applyDrawOperation(host.id, code, clear)).toEqual(clear);
		expect(service.getDrawingHistory(guest.id, code)).toEqual([]);
	});

	it.each([
		["stroke", stroke],
		["clear", clear],
	])(
		"rejects a non-host %s with NOT_HOST and leaves history unchanged",
		(_label, operation) => {
			const { service, code } = setup();
			service.applyDrawOperation(host.id, code, stroke);
			expectRoomError(
				() => service.applyDrawOperation(guest.id, code, operation),
				"NOT_HOST",
			);
			expect(service.getDrawingHistory(host.id, code)).toEqual([stroke]);
		},
	);

	it("rejects a nonmember with NOT_IN_ROOM", () => {
		const { service, code } = setup();
		service.createRoom(outsider, { settings });
		expectRoomError(
			() => service.applyDrawOperation(outsider.id, code, stroke),
			"NOT_IN_ROOM",
		);
		expectRoomError(
			() => service.applyDrawOperation("nobody", code, clear),
			"NOT_IN_ROOM",
		);
		expect(service.getDrawingHistory(host.id, code)).toEqual([]);
	});

	it("rejects drawing in a missing room with ROOM_NOT_FOUND", () => {
		const { service } = setup();
		expectRoomError(
			() => service.applyDrawOperation(host.id, "ZZZZZZ", stroke),
			"ROOM_NOT_FOUND",
		);
	});

	it("moves drawing rights to the new host when the host leaves", () => {
		const { service, code } = setup();
		service.applyDrawOperation(host.id, code, stroke);
		const snapshot = service.leaveRoom(host, code);
		expect(snapshot?.hostId).toBe(guest.id);

		expectRoomError(
			() => service.applyDrawOperation(host.id, code, clear),
			"NOT_IN_ROOM",
		);
		expectRoomError(
			() => service.applyDrawOperation(third.id, code, stroke),
			"NOT_HOST",
		);
		const next = { ...stroke, color: "#abcdef" } as DrawOperation;
		expect(service.applyDrawOperation(guest.id, code, next)).toEqual(next);
		expect(service.getDrawingHistory(third.id, code)).toEqual([stroke, next]);

		// Rejoining does not restore host status, so the old host stays a viewer.
		service.joinRoom(host, code);
		expect(service.getRoom(code).hostId).toBe(guest.id);
		expectRoomError(
			() => service.applyDrawOperation(host.id, code, clear),
			"NOT_HOST",
		);
		expect(service.getDrawingHistory(host.id, code)).toEqual([stroke, next]);
	});

	it("stops a member who left from drawing", () => {
		const { service, code } = setup();
		service.leaveRoom(guest, code);
		expectRoomError(
			() => service.applyDrawOperation(guest.id, code, stroke),
			"NOT_IN_ROOM",
		);
		expectRoomError(
			() => service.getDrawingHistory(guest.id, code),
			"NOT_IN_ROOM",
		);
		expect(service.getDrawingHistory(host.id, code)).toEqual([]);
	});
});
