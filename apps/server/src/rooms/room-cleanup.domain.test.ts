import { afterEach, expect, it, vi } from "vitest";
import { startRoomCleanup } from "./room-cleanup";
import { RoomService } from "./room-service";

afterEach(() => {
	vi.useRealTimers();
});

it("automatically removes empty rooms and stops scheduling when disposed", () => {
	vi.useFakeTimers();
	const service = new RoomService({ now: () => Date.now() });
	const player = { id: "user-1", name: "Seif" };
	const room = service.createRoom(player, {
		settings: { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 },
	});
	service.leaveRoom(player, room.code);
	const sweep = vi.spyOn(service, "expireEmptyRooms");
	const stop = startRoomCleanup(service);
	try {
		vi.advanceTimersByTime(60_000);
		expect(sweep).toHaveBeenCalledTimes(6);
		expect(sweep).toHaveLastReturnedWith(1);
		expect(() => service.joinRoom(player, room.code)).toThrow(
			"Room not found.",
		);
		stop();
		stop();
		vi.advanceTimersByTime(20_000);
		expect(sweep).toHaveBeenCalledTimes(6);
	} finally {
		stop();
	}
});
