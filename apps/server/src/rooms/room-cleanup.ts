import type { RoomService } from "./room-service";

export function startRoomCleanup(service: RoomService): () => void {
	const timer = setInterval(() => service.expireEmptyRooms(), 10_000);
	timer.unref();
	return () => clearInterval(timer);
}
