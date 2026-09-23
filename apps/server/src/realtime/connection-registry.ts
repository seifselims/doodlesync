import { socketCloseCodes } from "@doodlesync/shared";

export type RoomSocket = {
	close(code?: number, reason?: string): void;
};

type Connection<Socket> = {
	roomCode: string;
	socket: Socket;
};

// Tracks each player's single live socket. The newest connection wins: attaching
// a second socket closes the first, and the first socket's later close event is
// ignored so it cannot detach its replacement.
export class ConnectionRegistry<Socket extends RoomSocket = RoomSocket> {
	private readonly connections = new Map<string, Connection<Socket>>();

	attach(playerId: string, roomCode: string, socket: Socket) {
		const previous = this.connections.get(playerId);
		this.connections.set(playerId, { roomCode, socket });
		if (previous && previous.socket !== socket) {
			previous.socket.close(
				socketCloseCodes.replaced,
				"Connected from another tab or device.",
			);
		}
	}

	// Returns false for a socket that was already replaced.
	detach(playerId: string, socket: Socket) {
		if (this.connections.get(playerId)?.socket !== socket) return false;
		this.connections.delete(playerId);
		return true;
	}

	get(playerId: string) {
		return this.connections.get(playerId);
	}
}
