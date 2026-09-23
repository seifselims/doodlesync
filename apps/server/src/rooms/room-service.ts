import { createRoomInputSchema, type PlayerSnapshot } from "@doodlesync/shared";
import { generateRoomCode } from "./room-code";
import { RoomError } from "./room-error";
import type { RoomState } from "./room-state";

type RoomServiceOptions = {
	now?: () => number;
	emptyRoomTtlMs?: number;
};

export class RoomService {
	private rooms = new Map<string, RoomState>();
	private memberships = new Map<string, string>();
	private readonly now: () => number;
	private readonly emptyRoomTtlMs: number;

	constructor({
		now = Date.now,
		emptyRoomTtlMs = 60_000,
	}: RoomServiceOptions = {}) {
		if (!Number.isFinite(emptyRoomTtlMs) || emptyRoomTtlMs <= 0) {
			throw new Error("Empty-room TTL must be a positive finite number.");
		}
		this.now = now;
		this.emptyRoomTtlMs = emptyRoomTtlMs;
	}

	private isExpired(room: RoomState, now: number): boolean {
		return (
			room.players.size === 0 &&
			room.emptySince !== null &&
			now - room.emptySince >= this.emptyRoomTtlMs
		);
	}

	private findRoom(code: string): RoomState | undefined {
		const room = this.rooms.get(code);
		if (room && this.isExpired(room, this.now())) {
			this.rooms.delete(code);
			return undefined;
		}
		return room;
	}

	expireEmptyRooms(): number {
		const now = this.now();
		let removed = 0;
		for (const [code, room] of this.rooms) {
			if (this.isExpired(room, now)) {
				this.rooms.delete(code);
				removed++;
			}
		}
		return removed;
	}

	private assertAvailableMembership(playerId: string, code?: string): void {
		const current = this.memberships.get(playerId);
		if (current !== undefined && current !== code) {
			throw new RoomError("ALREADY_IN_ROOM", "Leave your current room first.");
		}
	}

	createRoom(player: PlayerSnapshot, input: unknown) {
		const createInput = createRoomInputSchema.parse(input);
		this.assertAvailableMembership(player.id);
		let code = generateRoomCode();
		let attempts = 1;
		while (this.findRoom(code)) {
			if (attempts >= 10) {
				throw new RoomError(
					"ROOM_CODE_EXHAUSTED",
					"Could not generate a room code at this time. Try again Later.",
				);
			}
			code = generateRoomCode();
			attempts++;
		}
		const room: RoomState = {
			code,
			hostId: player.id,
			status: "LOBBY",
			settings: createInput.settings,
			players: new Map([[player.id, { ...player }]]),
			emptySince: null,
		};
		this.rooms.set(code, room);
		this.memberships.set(player.id, code);
		return {
			code: room.code,
			hostId: room.hostId,
			settings: { ...room.settings },
			players: Array.from(room.players.values(), (player) => ({ ...player })),
		};
	}
	// Transport callers must use this authorized lookup with session-derived identity.
	getRoomForMember(playerId: string, code: string) {
		const snapshot = this.getRoom(code);
		if (this.memberships.get(playerId) !== snapshot.code) {
			throw new RoomError("NOT_IN_ROOM", "You are not a member of this room.");
		}
		return snapshot;
	}

	getRoom(code: string) {
		const room = this.findRoom(code.trim().toUpperCase());
		if (!room || room.hostId === null) {
			throw new RoomError("ROOM_NOT_FOUND", "Room not found.");
		}
		return {
			code: room.code,
			hostId: room.hostId,
			settings: { ...room.settings },
			players: Array.from(room.players.values(), (player) => ({ ...player })),
		};
	}
	joinRoom(player: PlayerSnapshot, code: string) {
		const normalizedCode = code.trim().toUpperCase();
		this.assertAvailableMembership(player.id, normalizedCode);
		const room = this.findRoom(normalizedCode);

		if (!room) {
			throw new RoomError("ROOM_NOT_FOUND", "Room not found.");
		}

		if (room.players.has(player.id)) {
			return this.getRoom(normalizedCode);
		}

		if (room.players.size >= room.settings.maxPlayers) {
			throw new RoomError("ROOM_FULL", "Room is full.");
		}

		if (room.players.size === 0) {
			room.hostId = player.id;
		}

		room.players.set(player.id, { ...player });
		this.memberships.set(player.id, normalizedCode);
		room.emptySince = null;

		return this.getRoom(normalizedCode);
	}
	leaveRoom(player: PlayerSnapshot, code: string) {
		const normalizedCode = code.trim().toUpperCase();
		const room = this.findRoom(normalizedCode);
		if (!room) return null;

		if (!room.players.delete(player.id)) {
			return room.players.size === 0 ? null : this.getRoom(normalizedCode);
		}

		this.memberships.delete(player.id);

		if (room.players.size === 0) {
			room.hostId = null;
			room.emptySince = this.now();
			return null;
		}

		if (room.hostId === player.id) {
			room.hostId = room.players.keys().next().value ?? null;
		}

		return this.getRoom(normalizedCode);
	}
}
