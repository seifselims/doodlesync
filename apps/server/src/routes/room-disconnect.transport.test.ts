import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import {
	roomSnapshotSchema,
	type ServerEvent,
	serverEventsSchema,
	socketCloseCodes,
} from "@doodlesync/shared";
import { serve } from "@hono/node-server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createApp } from "../app";
import { ConnectionRegistry } from "../realtime/connection-registry";
import { createWebSocketServer } from "../realtime/websocket-server";
import { RoomService } from "../rooms/room-service";

const host = { id: "host", name: "Host" };
const guest = { id: "guest", name: "Guest" };
const settings = { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 };
const origin = "http://localhost:3001";

// Network I/O stays real while only application timeout scheduling is advanced.
async function eventually(check: () => boolean) {
	for (let i = 0; i < 400; i++) {
		if (check()) return;
		await wait(5);
	}
	throw new Error("Timed out waiting for socket activity");
}

describe("room socket commands and membership lifecycle", () => {
	let dispose: (() => Promise<void>) | undefined;
	beforeEach(() =>
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }),
	);
	afterEach(async () => {
		try {
			await dispose?.();
		} finally {
			dispose = undefined;
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	async function setup(createThroughHttp = false) {
		const roomService = new RoomService();
		const connections = new ConnectionRegistry();
		const app = createApp({
			corsOrigin: origin,
			roomService,
			connections,
			getSession: async (headers) => ({
				user:
					headers.get("Cookie") === "guest"
						? guest
						: headers.get("Cookie") === "outsider"
							? { id: "outsider", name: "Outsider" }
							: host,
			}),
			authHandler: async () => new Response(),
		});
		const room = createThroughHttp
			? roomSnapshotSchema.parse(
					await (
						await app.request("/api/rooms", {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Origin: origin,
								Cookie: host.id,
							},
							body: JSON.stringify({ settings }),
						})
					).json(),
				)
			: roomService.createRoom(host, { settings });
		if (!createThroughHttp) roomService.joinRoom(guest, room.code);

		const wss = createWebSocketServer();
		const clients: WebSocket[] = [];
		const server = serve({
			fetch: app.fetch,
			port: 0,
			websocket: { server: wss },
		});
		dispose = async () => {
			for (const client of clients) client.terminate();
			for (const socket of wss.clients) socket.terminate();
			await eventually(() => wss.clients.size === 0);
			await new Promise<void>((resolve) => wss.close(() => resolve()));
			await new Promise<void>((resolve) => server.close(() => resolve()));
		};
		if (!server.listening) await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("Missing port");
		const port = address.port;
		async function connect(id: string, code = room.code) {
			const socket = new WebSocket(
				`ws://localhost:${port}/api/rooms/${code}/ws`,
				{
					headers: { Origin: origin, Cookie: id },
				},
			);
			clients.push(socket);
			const events: ServerEvent[] = [];
			socket.on("message", (data) =>
				events.push(serverEventsSchema.parse(JSON.parse(data.toString()))),
			);
			await once(socket, "open");
			await eventually(() => events.length >= 1);
			return { socket, events };
		}
		async function disconnect(socket: WebSocket, id: string) {
			const closed = once(socket, "close");
			socket.terminate();
			await closed;
			await eventually(() => !connections.get(id));
		}
		return { app, roomService, connections, room, connect, disconnect };
	}

	it.each([
		["malformed JSON", "{"],
		["unknown command", JSON.stringify({ type: "room:destroy" })],
		["non-object JSON", "null"],
		["missing fields", JSON.stringify({ type: "room:update-settings" })],
		[
			"invalid settings",
			JSON.stringify({
				type: "room:update-settings",
				settings: { ...settings, rounds: 0 },
			}),
		],
		[
			"forged identity",
			JSON.stringify({ type: "room:leave", playerId: "guest" }),
		],
		["binary data", Buffer.from(JSON.stringify({ type: "room:leave" }))],
	])(
		"rejects %s without mutation and continues handling messages",
		async (_label, payload) => {
			const { roomService, room, connect } = await setup();
			const owner = await connect(host.id);
			const before = roomService.getRoom(room.code);
			owner.socket.send(payload);
			await eventually(() => owner.events.length === 2);
			expect(owner.events[1]).toMatchObject({
				type: "error",
				error: { code: "INVALID_INPUT" },
			});
			expect(roomService.getRoom(room.code)).toEqual(before);
			owner.socket.send(
				JSON.stringify({ type: "room:update-settings", settings }),
			);
			await eventually(() => owner.events.length === 3);
			expect(owner.events[2]).toMatchObject({ type: "room:snapshot" });
			expect(owner.socket.readyState).toBe(WebSocket.OPEN);
		},
	);

	it("persists host settings and broadcasts only to this room's connected members", async () => {
		const { roomService, room, connect, connections } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		const otherRoom = roomService.createRoom(
			{ id: "outsider", name: "Outsider" },
			{ settings },
		);
		const outsider = await connect("outsider", otherRoom.code);
		const otherConnection = connections.get("outsider");
		if (!otherConnection) throw new Error("Missing outsider connection");
		const sendOutside = vi.spyOn(otherConnection.socket, "send");
		const nextSettings = { ...settings, rounds: 5 };
		owner.socket.send(
			JSON.stringify({ type: "room:update-settings", settings: nextSettings }),
		);
		await eventually(
			() => owner.events.length === 2 && member.events.length === 2,
		);
		const snapshot = roomService.getRoom(room.code);
		expect(snapshot.settings).toEqual(nextSettings);
		expect(owner.events[1]).toEqual({ type: "room:snapshot", snapshot });
		expect(member.events[1]).toEqual(owner.events[1]);
		expect(sendOutside).not.toHaveBeenCalled();
		expect(outsider.events).toHaveLength(1);
		expect(roomService.getRoom(otherRoom.code)).toEqual(otherRoom);
	});

	it("rejects settings changes by a non-host without broadcasting", async () => {
		const { roomService, room, connect, connections } = await setup();
		await connect(host.id);
		const member = await connect(guest.id);
		const ownerConnection = connections.get(host.id);
		if (!ownerConnection) throw new Error("Missing host connection");
		const send = vi.spyOn(ownerConnection.socket, "send");
		member.socket.send(
			JSON.stringify({
				type: "room:update-settings",
				settings: { ...settings, rounds: 5 },
			}),
		);
		await eventually(() => member.events.length === 2);
		expect(member.events[1]).toMatchObject({
			type: "error",
			error: { code: "NOT_HOST" },
		});
		expect(roomService.getRoom(room.code).settings).toEqual(settings);
		expect(send).not.toHaveBeenCalled();
	});

	it.each(["room:leave", "room:update-settings"])(
		"rechecks membership for %s after the socket opened",
		async (type) => {
			const { roomService, room, connect } = await setup();
			const member = await connect(guest.id);
			roomService.leaveRoom(guest, room.code);
			const before = roomService.getRoom(room.code);
			member.socket.send(
				JSON.stringify(type === "room:leave" ? { type } : { type, settings }),
			);
			await eventually(() => member.events.length === 2);
			expect(member.events[1]).toMatchObject({
				type: "error",
				error: { code: "NOT_IN_ROOM" },
			});
			expect(roomService.getRoom(room.code)).toEqual(before);
		},
	);

	it("rejects reducing capacity below the current membership", async () => {
		const { roomService, room, connect } = await setup();
		roomService.joinRoom({ id: "third", name: "Third" }, room.code);
		const owner = await connect(host.id);
		owner.socket.send(
			JSON.stringify({
				type: "room:update-settings",
				settings: { ...settings, maxPlayers: 2 },
			}),
		);
		await eventually(() => owner.events.length === 2);
		expect(owner.events[1]).toMatchObject({
			type: "error",
			error: { code: "INVALID_INPUT" },
		});
		expect(roomService.getRoom(room.code).settings).toEqual(settings);
	});

	it.each([false, true])(
		"closes oversized messages safely (fragmented: %s)",
		async (fragmented) => {
			const { roomService, room, connect, connections } = await setup();
			const owner = await connect(host.id);
			const before = roomService.getRoom(room.code);
			const update = vi.spyOn(roomService, "updateSettings");
			const command = JSON.stringify({
				type: "room:update-settings",
				settings,
			});
			// A valid JSON command padded to the exact production byte limit is accepted.
			owner.socket.send(command.padEnd(16 * 1024, " "));
			await eventually(() => owner.events.length === 2);
			expect(owner.events[1]).toMatchObject({ type: "room:snapshot" });
			update.mockClear();
			const closed = once(owner.socket, "close");
			if (fragmented) {
				owner.socket.send(command.padEnd(8192, " "), { fin: false });
				owner.socket.send(" ".repeat(8193), { fin: true });
			} else {
				owner.socket.send(command.padEnd(16 * 1024 + 1, " "));
			}
			const [code] = await closed;
			expect(code).toBe(1009);
			await eventually(() => !connections.get(host.id));
			expect(update).not.toHaveBeenCalled();
			expect(roomService.getRoom(room.code)).toEqual(before);
			// The listener remains usable after the oversized message.
			const replacement = await connect(host.id);
			expect(replacement.events[0]).toEqual({
				type: "room:snapshot",
				snapshot: before,
			});
		},
	);

	it("joins over HTTP, notifies the host and attaches the new member's socket", async () => {
		const { app, roomService, room, connect } = await setup(true);
		const owner = await connect(host.id);
		const response = await app.request(`/api/rooms/${room.code}/join`, {
			method: "POST",
			headers: { Origin: origin, Cookie: guest.id },
		});
		expect(response.status).toBe(200);
		const snapshot = await response.json();
		await eventually(() => owner.events.length === 2);
		expect(owner.events[1]).toEqual({ type: "room:snapshot", snapshot });
		const member = await connect(guest.id);
		expect(member.events[0]).toEqual(owner.events[1]);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(roomService.getRoomForMember(guest.id, room.code)).toEqual(snapshot);
	});

	it("expires an HTTP-created membership that never connects and permits empty-room expiry", async () => {
		const { roomService, room } = await setup(true);
		await vi.advanceTimersByTimeAsync(29_999);
		expect(roomService.getRoomForMember(host.id, room.code)).toEqual(room);
		await vi.advanceTimersByTimeAsync(1);
		expect(() => roomService.getRoomForMember(host.id, room.code)).toThrow();
		// Released account can create again; the old empty room follows its normal TTL.
		expect(() => roomService.createRoom(host, { settings })).not.toThrow();
		expect(roomService.expireEmptyRooms()).toBe(0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(roomService.expireEmptyRooms()).toBe(1);
	});

	it("cancels the initial attachment deadline when a socket connects in time", async () => {
		const { roomService, room, connect } = await setup(true);
		await vi.advanceTimersByTimeAsync(29_999);
		const owner = await connect(host.id);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(roomService.getRoomForMember(host.id, room.code)).toEqual(room);
		expect(owner.socket.readyState).toBe(WebSocket.OPEN);
	});

	it("preserves membership during grace, then removes the host and broadcasts host transfer", async () => {
		const { roomService, room, connect, disconnect } = await setup();
		const owner = await connect(host.id);
		const remaining = await connect(guest.id);
		await disconnect(owner.socket, host.id);
		await vi.advanceTimersByTimeAsync(29_999);
		expect(roomService.getRoomForMember(host.id, room.code).hostId).toBe(
			host.id,
		);
		expect(remaining.events).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		await eventually(() => remaining.events.length === 2);
		const snapshot = roomService.getRoom(room.code);
		expect(snapshot.players).toEqual([guest]);
		expect(snapshot.hostId).toBe(guest.id);
		expect(remaining.events[1]).toEqual({ type: "room:snapshot", snapshot });
	});

	it("cancels cleanup on reconnect and grants a fresh grace period on the next disconnect", async () => {
		const { roomService, room, connect, disconnect } = await setup();
		const first = await connect(host.id);
		await disconnect(first.socket, host.id);
		await vi.advanceTimersByTimeAsync(10_000);
		const second = await connect(host.id);
		expect(vi.getTimerCount()).toBe(0);
		await disconnect(second.socket, host.id);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(roomService.getRoomForMember(host.id, room.code).hostId).toBe(
			host.id,
		);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(roomService.getRoom(room.code).players).toEqual([guest]);
	});

	it("does not schedule cleanup when a replaced socket closes", async () => {
		const { roomService, connections, room, connect } = await setup();
		const detach = vi.spyOn(connections, "detach");
		const first = await connect(host.id);
		const closed = once(first.socket, "close");
		const second = await connect(host.id);
		await closed;
		await eventually(() =>
			detach.mock.results.some((result) => result.value === false),
		);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(second.socket.readyState).toBe(WebSocket.OPEN);
		expect(roomService.getRoomForMember(host.id, room.code).hostId).toBe(
			host.id,
		);
	});

	it("leaves immediately and broadcasts without scheduling disconnect cleanup", async () => {
		const { roomService, connections, room, connect } = await setup();
		const owner = await connect(host.id);
		const remaining = await connect(guest.id);
		const closed = once(owner.socket, "close");
		owner.socket.send(JSON.stringify({ type: "room:leave" }));
		await closed;
		await eventually(
			() => !connections.get(host.id) && remaining.events.length === 2,
		);
		expect(owner.events).toContainEqual({ type: "room:left" });
		expect(roomService.getRoom(room.code).players).toEqual([guest]);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(remaining.events).toHaveLength(2);
	});

	it("does not remove a player who moved to another room before the deadline", async () => {
		const { roomService, room, connect, disconnect } = await setup();
		const owner = await connect(host.id);
		await disconnect(owner.socket, host.id);
		roomService.leaveRoom(host, room.code);
		const nextRoom = roomService.createRoom(host, { settings });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(roomService.getRoomForMember(host.id, nextRoom.code)).toEqual(
			nextRoom,
		);
	});

	it("broadcasts chat with the session author to this room's members only", async () => {
		const { roomService, room, connect } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		const otherRoom = roomService.createRoom(
			{ id: "outsider", name: "Outsider" },
			{ settings },
		);
		const outsider = await connect("outsider", otherRoom.code);
		member.socket.send(JSON.stringify({ type: "chat:send", text: "  hi  " }));
		await eventually(
			() => owner.events.length === 2 && member.events.length === 2,
		);
		const [message] = roomService.getChatHistory(guest.id, room.code);
		expect(message).toMatchObject({
			authorId: guest.id,
			authorName: guest.name,
			text: "hi",
		});
		expect(owner.events[1]).toEqual({ type: "chat:message", message });
		expect(member.events[1]).toEqual(owner.events[1]);
		expect(outsider.events).toHaveLength(1);
		expect(roomService.getChatHistory("outsider", otherRoom.code)).toEqual([]);
	});

	it.each([
		["missing text", { type: "chat:send" }],
		["whitespace-only text", { type: "chat:send", text: " \n\t " }],
		["oversized text", { type: "chat:send", text: "a".repeat(201) }],
		["forged author", { type: "chat:send", text: "hi", authorId: host.id }],
		["forged timestamp", { type: "chat:send", text: "hi", sentAt: 0 }],
	])("rejects chat with %s without broadcasting", async (_label, command) => {
		const { roomService, room, connect } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		member.socket.send(JSON.stringify(command));
		await eventually(() => member.events.length === 2);
		expect(member.events[1]).toMatchObject({
			type: "error",
			error: { code: "INVALID_INPUT" },
		});
		expect(owner.events).toHaveLength(1);
		expect(roomService.getChatHistory(host.id, room.code)).toEqual([]);
	});

	it("rechecks membership for chat after the socket opened", async () => {
		const { roomService, room, connect } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		roomService.leaveRoom(guest, room.code);
		member.socket.send(JSON.stringify({ type: "chat:send", text: "hi" }));
		await eventually(() => member.events.length === 2);
		expect(member.events[1]).toMatchObject({
			type: "error",
			error: { code: "NOT_IN_ROOM" },
		});
		expect(owner.events).toHaveLength(1);
		expect(roomService.getChatHistory(host.id, room.code)).toEqual([]);
	});

	it("closes a chat flood with the rate-limit code after the burst", async () => {
		// Freeze only the limiter's clock so no tokens refill during the burst.
		const clock = vi.spyOn(performance, "now").mockReturnValue(0);
		try {
			const { roomService, room, connect } = await setup();
			const owner = await connect(host.id);
			const member = await connect(guest.id);
			const closed = once(member.socket, "close");
			for (let i = 0; i < 11; i++) {
				member.socket.send(
					JSON.stringify({ type: "chat:send", text: `message ${i}` }),
				);
			}
			const [code] = await closed;
			expect(code).toBe(socketCloseCodes.rateLimited);
			await eventually(() => owner.events.length === 11);
			const texts = roomService
				.getChatHistory(host.id, room.code)
				.map((message) => message.text);
			expect(texts).toHaveLength(10);
			expect(texts).not.toContain("message 10");
		} finally {
			clock.mockRestore();
		}
	});

	it("sends recent chat only to a reconnecting socket, after its snapshot", async () => {
		const { roomService, room, connect, disconnect } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		roomService.postChatMessage(host, room.code, "first");
		roomService.postChatMessage(guest, room.code, "second");
		await disconnect(member.socket, guest.id);

		const returning = await connect(guest.id);
		await eventually(() => returning.events.length === 2);
		expect(returning.events[0]).toMatchObject({ type: "room:snapshot" });
		expect(returning.events[1]).toEqual({
			type: "chat:history",
			messages: roomService.getChatHistory(guest.id, room.code),
		});
		expect(
			returning.events[1]?.type === "chat:history" &&
				returning.events[1].messages.map((message) => message.text),
		).toEqual(["first", "second"]);
		expect(owner.events).toHaveLength(1);
	});

	it("sends each room only its own history and none for a room without chat", async () => {
		const { roomService, room, connect } = await setup();
		roomService.postChatMessage(host, room.code, "in this room");
		const otherRoom = roomService.createRoom(
			{ id: "outsider", name: "Outsider" },
			{ settings },
		);
		const outsider = await connect("outsider", otherRoom.code);
		const owner = await connect(host.id);
		await eventually(() => owner.events.length === 2);
		expect(owner.events[1]).toMatchObject({
			type: "chat:history",
			messages: [{ text: "in this room" }],
		});
		// Give any stray history time to arrive before asserting its absence.
		await wait(50);
		expect(outsider.events).toEqual([
			{
				type: "room:snapshot",
				snapshot: roomService.getRoom(otherRoom.code),
			},
		]);
	});
});
