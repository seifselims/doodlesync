import {
	CHAT_MESSAGE_MAX_LENGTH,
	chatMessageSchema,
	roomSnapshotSchema,
} from "@doodlesync/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { generateRoomCode } from "./room-code";
import { RoomError } from "./room-error";
import { RoomService } from "./room-service";

vi.mock("./room-code", () => ({ generateRoomCode: vi.fn() }));

const generateCode = vi.mocked(generateRoomCode);
const player = { id: "user-1", name: "Seif" };
const settings = { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 };

describe("RoomService", () => {
	beforeEach(() => {
		generateCode.mockReset();
		generateCode.mockReturnValue("ABC234");
	});

	it("reports only the caller's current room and clears it after leaving", () => {
		const service = new RoomService();
		expect(service.getCurrentRoomCode(player.id)).toBeNull();
		const room = service.createRoom(player, { settings });
		expect(service.getCurrentRoomCode(player.id)).toBe(room.code);
		expect(service.getCurrentRoomCode("someone-else")).toBeNull();
		service.leaveRoom(player, room.code);
		expect(service.getCurrentRoomCode(player.id)).toBeNull();
	});

	it("creates a public snapshot with the creator as host and first player", () => {
		const service = new RoomService();
		const room = service.createRoom(player, { settings });

		expect(room).toEqual({
			code: "ABC234",
			hostId: player.id,
			settings,
			players: [player],
		});
		expect(roomSnapshotSchema.safeParse(room).success).toBe(true);
	});

	it.each([
		undefined,
		null,
		{},
		{ settings: { ...settings, maxPlayers: 1 } },
		{ settings: { ...settings, maxPlayers: 13 } },
		{ settings: { ...settings, rounds: 0 } },
		{ settings: { ...settings, drawTimeSeconds: 29 } },
		{ settings: { ...settings, rounds: "3" } },
		{ settings, hostId: "forged-host" },
	])("rejects invalid input without allocating a code: %j", (input) => {
		const service = new RoomService();

		expect(() => service.createRoom(player, input)).toThrow(ZodError);
		expect(generateCode).not.toHaveBeenCalled();
	});

	it("retries a taken code and preserves the existing room", () => {
		const service = new RoomService();
		const first = service.createRoom(player, { settings });
		generateCode.mockReturnValueOnce(first.code).mockReturnValueOnce("XYZ789");
		const secondPlayer = { id: "user-2", name: "Omar" };
		const second = service.createRoom(secondPlayer, { settings });

		expect(second.code).toBe("XYZ789");
		expect(second.players).toEqual([secondPlayer]);
		expect(generateCode).toHaveBeenCalledTimes(3);
		expect(service.getRoom(first.code)).toEqual(first);
		expect(service.getRoom(second.code)).toEqual(second);
	});

	it("stops after ten collisions without overwriting the existing room", () => {
		const service = new RoomService();
		service.createRoom(player, { settings });
		generateCode.mockClear();

		expect(() =>
			service.createRoom({ id: "user-2", name: "Omar" }, { settings }),
		).toThrow("Could not generate a room code");
		expect(generateCode).toHaveBeenCalledTimes(10);
		expect(service.getRoom("ABC234")).toEqual({
			code: "ABC234",
			hostId: player.id,
			settings,
			players: [player],
		});
	});

	it("accepts an available code on the tenth attempt", () => {
		const service = new RoomService();
		service.createRoom(player, { settings });
		generateCode.mockReset();
		for (let attempt = 0; attempt < 9; attempt++) {
			generateCode.mockReturnValueOnce("ABC234");
		}
		generateCode.mockReturnValueOnce("XYZ789");

		const room = service.createRoom(
			{ id: "user-2", name: "Omar" },
			{ settings },
		);
		expect(room.code).toBe("XYZ789");
		expect(generateCode).toHaveBeenCalledTimes(10);
	});

	it("isolates stored state from input and snapshot mutations", () => {
		const service = new RoomService();
		const creator = { ...player };
		const input = { settings: { ...settings } };
		const snapshot = service.createRoom(creator, input);

		creator.name = "Changed input";
		input.settings.rounds = 9;
		snapshot.settings.maxPlayers = 2;
		const returnedPlayer = snapshot.players[0];
		if (!returnedPlayer)
			throw new Error("Expected the creator in the snapshot");
		returnedPlayer.name = "Changed snapshot";
		snapshot.players.length = 0;

		const stored = service.getRoom(snapshot.code);
		expect(stored.settings).toEqual(settings);
		expect(stored.players).toEqual([player]);
	});

	it("keeps rooms in separate service instances independent", () => {
		const first = new RoomService();
		const second = new RoomService();
		first.createRoom(player, { settings });
		expect(() => second.createRoom(player, { settings })).not.toThrow();
		expect(generateCode).toHaveBeenCalledTimes(2);
	});

	describe("account membership", () => {
		const other = { id: "user-2", name: "Omar" };

		it("rejects another creation before allocating a code", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			generateCode.mockClear();
			expect(() =>
				service.createRoom({ ...player, name: "Renamed" }, { settings }),
			).toThrow(
				new RoomError("ALREADY_IN_ROOM", "Leave your current room first."),
			);
			expect(generateCode).not.toHaveBeenCalled();
			expect(service.getRoom(room.code)).toEqual(room);
		});

		it("rejects cross-room joins without changing either room", () => {
			const service = new RoomService();
			const first = service.createRoom(player, { settings });
			generateCode.mockReturnValue("XYZ789");
			const second = service.createRoom(other, { settings });
			expect(() => service.joinRoom(player, second.code)).toThrowError(
				expect.objectContaining({ code: "ALREADY_IN_ROOM" }),
			);
			expect(service.getRoom(first.code)).toEqual(first);
			expect(service.getRoom(second.code)).toEqual(second);
			expect(service.joinRoom(player, " abc234 ")).toEqual(first);
		});

		it("releases membership on leave and ignores stale or unrelated leaves", () => {
			const service = new RoomService();
			const first = service.createRoom(player, { settings });
			generateCode.mockReturnValue("XYZ789");
			const second = service.createRoom(other, { settings });
			service.leaveRoom(player, " abc234 ");
			service.joinRoom(player, second.code);
			service.leaveRoom(player, first.code);
			service.leaveRoom(player, "MISSING");
			expect(() => service.joinRoom(player, first.code)).toThrowError(
				expect.objectContaining({ code: "ALREADY_IN_ROOM" }),
			);
			service.leaveRoom(player, second.code);
			generateCode.mockReturnValue("NEW234");
			expect(service.createRoom(player, { settings }).players).toEqual([
				player,
			]);
		});

		it("does not reserve membership after failed joins or code exhaustion", () => {
			const service = new RoomService();
			const first = service.createRoom(player, {
				settings: { ...settings, maxPlayers: 2 },
			});
			service.joinRoom(other, first.code);
			const guest = { id: "user-3", name: "Mona" };
			expect(() => service.joinRoom(guest, first.code)).toThrowError(
				expect.objectContaining({ code: "ROOM_FULL" }),
			);
			expect(() => service.joinRoom(guest, "MISSING")).toThrowError(
				expect.objectContaining({ code: "ROOM_NOT_FOUND" }),
			);
			expect(() => service.createRoom(guest, { settings })).toThrowError(
				expect.objectContaining({ code: "ROOM_CODE_EXHAUSTED" }),
			);
			generateCode.mockReturnValue("XYZ789");
			expect(service.createRoom(guest, { settings }).players).toEqual([guest]);
		});
	});

	describe("getRoom", () => {
		it("looks up an existing room and normalizes the code", () => {
			const service = new RoomService();
			const created = service.createRoom(player, { settings });
			expect(service.getRoom(created.code)).toEqual(created);
			expect(service.getRoom("  abc234  ")).toEqual(created);
		});

		it("rejects a missing room", () => {
			expect(() => new RoomService().getRoom("MISSING")).toThrow(
				"Room not found.",
			);
		});

		it("returns independent copies on every lookup", () => {
			const service = new RoomService();
			const created = service.createRoom(player, { settings });
			const snapshot = service.getRoom(created.code);
			snapshot.settings.rounds = 10;
			const firstPlayer = snapshot.players[0];
			if (!firstPlayer) throw new Error("Expected a player");
			firstPlayer.name = "Changed";
			snapshot.players.length = 0;
			expect(service.getRoom(created.code)).toEqual(created);
		});
	});

	describe("joinRoom", () => {
		const guest = { id: "user-2", name: "Omar" };

		it("adds a player to the stored room using a normalized code", () => {
			const service = new RoomService();
			const created = service.createRoom(player, { settings });
			const joined = service.joinRoom(guest, "  abc234  ");
			expect(joined).toEqual({ ...created, players: [player, guest] });
			expect(service.getRoom(created.code)).toEqual(joined);
			expect(roomSnapshotSchema.safeParse(joined).success).toBe(true);
		});

		it("rejects joining a missing room", () => {
			expect(() => new RoomService().joinRoom(guest, "MISSING")).toThrow(
				"Room not found.",
			);
		});

		it("does not duplicate a player on repeated joins", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			const firstJoin = service.joinRoom(guest, room.code);
			expect(service.joinRoom(guest, room.code)).toEqual(firstJoin);
			expect(service.getRoom(room.code).players).toEqual([player, guest]);
		});

		it("enforces the configured capacity without changing the full room", () => {
			const service = new RoomService();
			const room = service.createRoom(player, {
				settings: { ...settings, maxPlayers: 2 },
			});
			const full = service.joinRoom(guest, room.code);
			expect(() =>
				service.joinRoom({ id: "user-3", name: "Mona" }, room.code),
			).toThrow("Room is full.");
			expect(service.getRoom(room.code)).toEqual(full);
		});

		it("allows an existing member to repeat a join when full", () => {
			const service = new RoomService();
			const room = service.createRoom(player, {
				settings: { ...settings, maxPlayers: 2 },
			});
			const full = service.joinRoom(guest, room.code);
			expect(service.joinRoom(guest, room.code)).toEqual(full);
			expect(service.joinRoom(player, room.code)).toEqual(full);
		});

		it("isolates stored players and settings from join input and returned data", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			const joiningPlayer = { ...guest };
			const joined = service.joinRoom(joiningPlayer, room.code);
			joiningPlayer.name = "Changed input";
			joined.settings.maxPlayers = 2;
			for (const member of joined.players) member.name = "Changed snapshot";
			joined.players.length = 0;
			expect(service.getRoom(room.code)).toEqual({
				...room,
				players: [player, guest],
			});
		});
	});

	describe("leaveRoom", () => {
		const guest = { id: "user-2", name: "Omar" };
		const third = { id: "user-3", name: "Mona" };

		it("removes a guest and preserves the host using a normalized code", () => {
			const service = new RoomService();
			const created = service.createRoom(player, { settings });
			service.joinRoom(guest, created.code);
			expect(service.leaveRoom(guest, " abc234 ")).toEqual(created);
			expect(service.getRoom(created.code)).toEqual(created);
		});

		it("transfers hosting to the earliest remaining member", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			service.joinRoom(guest, room.code);
			service.joinRoom(third, room.code);
			expect(service.leaveRoom(player, room.code)).toEqual({
				...room,
				hostId: guest.id,
				players: [guest, third],
			});
			expect(service.leaveRoom(guest, room.code)?.hostId).toBe(third.id);
		});

		it("makes repeated and nonmember leaves harmless", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			service.joinRoom(guest, room.code);
			service.leaveRoom(guest, room.code);
			expect(service.leaveRoom(guest, room.code)).toEqual(room);
			expect(service.leaveRoom(third, room.code)).toEqual(room);
			expect(service.leaveRoom(player, "MISSING")).toBeNull();
			expect(service.getRoom(room.code)).toEqual(room);
		});

		it("hides an empty room and assigns a new host when someone rejoins", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			expect(service.leaveRoom(player, room.code)).toBeNull();
			expect(service.leaveRoom(player, room.code)).toBeNull();
			expect(() => service.getRoom(room.code)).toThrow("Room not found.");
			expect(service.joinRoom(guest, room.code)).toEqual({
				...room,
				hostId: guest.id,
				players: [guest],
			});
		});

		it("frees capacity and returns a copy of remaining players", () => {
			const service = new RoomService();
			const room = service.createRoom(player, {
				settings: { ...settings, maxPlayers: 2 },
			});
			service.joinRoom(guest, room.code);
			const result = service.leaveRoom(guest, room.code);
			if (!result) throw new Error("Expected an occupied room");
			result.settings.rounds = 10;
			for (const member of result.players) member.name = "Changed";
			result.players.length = 0;
			expect(service.getRoom(room.code)).toEqual(room);
			expect(service.joinRoom(third, room.code).players).toEqual([
				player,
				third,
			]);
		});
	});

	describe("empty-room expiry", () => {
		it("expires exactly at the deadline, including an emptySince of zero", () => {
			let now = 0;
			const service = new RoomService({ now: () => now, emptyRoomTtlMs: 100 });
			const room = service.createRoom(player, { settings });
			service.leaveRoom(player, room.code);
			now = 99;
			expect(service.expireEmptyRooms()).toBe(0);
			now = 100;
			expect(service.expireEmptyRooms()).toBe(1);
			expect(service.expireEmptyRooms()).toBe(0);
			expect(service.expireEmptyRooms()).toBe(0);
			expect(() => service.joinRoom(player, room.code)).toThrow(
				"Room not found.",
			);
		});

		it("preserves occupied rooms", () => {
			let now = 0;
			const service = new RoomService({ now: () => now, emptyRoomTtlMs: 100 });
			const room = service.createRoom(player, { settings });
			now = 1000;
			expect(service.expireEmptyRooms()).toBe(0);
			expect(service.getRoom(room.code)).toEqual(room);
		});

		it("cancels expiry on rejoin and starts a fresh deadline on the next leave", () => {
			let now = 0;
			const service = new RoomService({ now: () => now, emptyRoomTtlMs: 100 });
			const room = service.createRoom(player, { settings });
			service.leaveRoom(player, room.code);
			now = 99;
			service.joinRoom(player, room.code);
			now = 150;
			expect(service.expireEmptyRooms()).toBe(0);
			service.leaveRoom(player, room.code);
			now = 249;
			expect(service.expireEmptyRooms()).toBe(0);
			now = 250;
			expect(service.expireEmptyRooms()).toBe(1);
		});

		it("does not extend the deadline on repeated leaves", () => {
			let now = 0;
			const service = new RoomService({ now: () => now, emptyRoomTtlMs: 100 });
			const room = service.createRoom(player, { settings });
			service.leaveRoom(player, room.code);
			now = 50;
			service.leaveRoom(player, room.code);
			now = 100;
			expect(service.expireEmptyRooms()).toBe(1);
		});

		it.each(["getRoom", "joinRoom"] as const)(
			"rejects expired rooms through %s before a sweep",
			(operation) => {
				let now = 0;
				const service = new RoomService({
					now: () => now,
					emptyRoomTtlMs: 100,
				});
				const room = service.createRoom(player, { settings });
				service.leaveRoom(player, room.code);
				now = 100;
				expect(() =>
					operation === "getRoom"
						? service.getRoom(room.code)
						: service.joinRoom(player, room.code),
				).toThrow("Room not found.");
				expect(service.expireEmptyRooms()).toBe(0);
				expect(() => service.joinRoom(player, room.code)).toThrow(
					"Room not found.",
				);
			},
		);

		it("reuses an expired code before the next sweep", () => {
			let now = 0;
			const service = new RoomService({ now: () => now, emptyRoomTtlMs: 100 });
			const room = service.createRoom(player, { settings });
			service.leaveRoom(player, room.code);
			now = 100;
			expect(service.createRoom(player, { settings }).code).toBe(room.code);
			expect(service.expireEmptyRooms()).toBe(0);
		});

		it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
			"rejects invalid TTL %s",
			(emptyRoomTtlMs) => {
				expect(() => new RoomService({ emptyRoomTtlMs })).toThrow(
					"Empty-room TTL",
				);
			},
		);
	});

	describe("chat", () => {
		const other = { id: "user-2", name: "Omar" };
		const notFound = expect.objectContaining({ code: "ROOM_NOT_FOUND" });
		const notInRoom = expect.objectContaining({ code: "NOT_IN_ROOM" });
		const invalid = expect.objectContaining({ code: "INVALID_INPUT" });

		it("assigns the author from room membership and the time from the clock", () => {
			const service = new RoomService({ now: () => 1_000 });
			const room = service.createRoom(player, { settings });

			const message = service.postChatMessage(
				{ id: player.id, name: "Forged Name" },
				room.code,
				"hello",
			);

			expect(message).toEqual({
				id: expect.any(String),
				authorId: player.id,
				authorName: player.name,
				text: "hello",
				sentAt: 1_000,
			});
			expect(chatMessageSchema.safeParse(message).success).toBe(true);
			expect(service.getChatHistory(player.id, room.code)).toEqual([message]);
		});

		it("trims text, normalizes the room code and gives each message its own id", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });

			const first = service.postChatMessage(player, " abc234 ", "  hi  ");
			const second = service.postChatMessage(player, room.code, "hi");

			expect(first.text).toBe("hi");
			expect(first.id).not.toBe(second.id);
		});

		it("rejects nonmembers and missing rooms without storing anything", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });

			expect(() =>
				service.postChatMessage(other, room.code, "hi"),
			).toThrowError(notInRoom);
			expect(() =>
				service.postChatMessage(player, "ZZZ999", "hi"),
			).toThrowError(notFound);
			expect(() => service.getChatHistory(other.id, room.code)).toThrowError(
				notInRoom,
			);
			expect(service.getChatHistory(player.id, room.code)).toEqual([]);
		});

		it("rejects a player who has left the room", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			service.joinRoom(other, room.code);
			service.leaveRoom(other, room.code);

			expect(() =>
				service.postChatMessage(other, room.code, "hi"),
			).toThrowError(notInRoom);
		});

		it.each(["", "   ", "\n\t ", "a".repeat(CHAT_MESSAGE_MAX_LENGTH + 1)])(
			"rejects invalid text without storing it: %j",
			(text) => {
				const service = new RoomService();
				const room = service.createRoom(player, { settings });

				expect(() =>
					service.postChatMessage(player, room.code, text),
				).toThrowError(invalid);
				expect(service.getChatHistory(player.id, room.code)).toEqual([]);
			},
		);

		it("accepts text at the maximum length", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			const text = "a".repeat(CHAT_MESSAGE_MAX_LENGTH);

			expect(service.postChatMessage(player, room.code, text).text).toBe(text);
		});

		it("keeps only the newest 50 messages, oldest first", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			for (let i = 0; i < 60; i++) {
				service.postChatMessage(player, room.code, `message ${i}`);
			}

			const history = service.getChatHistory(player.id, room.code);

			expect(history).toHaveLength(50);
			expect(history[0]?.text).toBe("message 10");
			expect(history.at(-1)?.text).toBe("message 59");
		});

		it("keeps each room's messages separate", () => {
			const service = new RoomService();
			const first = service.createRoom(player, { settings });
			generateCode.mockReturnValue("XYZ789");
			const second = service.createRoom(other, { settings });

			service.postChatMessage(player, first.code, "in first");
			service.postChatMessage(other, second.code, "in second");

			expect(
				service.getChatHistory(player.id, first.code).map((m) => m.text),
			).toEqual(["in first"]);
			expect(
				service.getChatHistory(other.id, second.code).map((m) => m.text),
			).toEqual(["in second"]);
		});

		it("never includes chat in room snapshots", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			service.postChatMessage(player, room.code, "hi");

			expect(service.getRoom(room.code)).not.toHaveProperty("chat");
			expect(service.getRoomForMember(player.id, room.code)).toEqual(room);
		});

		it("isolates stored messages from returned copies", () => {
			const service = new RoomService();
			const room = service.createRoom(player, { settings });
			const message = service.postChatMessage(player, room.code, "original");

			message.text = "changed";
			const history = service.getChatHistory(player.id, room.code);
			for (const stored of history) stored.authorName = "changed";
			history.push(message);

			expect(service.getChatHistory(player.id, room.code)).toEqual([
				{ ...message, text: "original" },
			]);
		});
	});
});
