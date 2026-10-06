import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import {
	type DrawOperation,
	type ServerEvent,
	serverEventsSchema,
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
const third = { id: "third", name: "Third" };
const users = new Map([host, guest, third].map((user) => [user.id, user]));
const settings = { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 };
const origin = "http://localhost:3001";

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

// Network I/O stays real while only application timeout scheduling is advanced.
async function eventually(check: () => boolean) {
	for (let i = 0; i < 400; i++) {
		if (check()) return;
		await wait(5);
	}
	throw new Error("Timed out waiting for socket activity");
}

describe("drawing permissions over live sockets", () => {
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

	async function setup() {
		const roomService = new RoomService();
		const connections = new ConnectionRegistry();
		const app = createApp({
			corsOrigin: origin,
			roomService,
			connections,
			getSession: async (headers) => ({
				user: users.get(headers.get("Cookie") ?? "") ?? host,
			}),
			authHandler: async () => new Response(),
		});
		const room = roomService.createRoom(host, { settings });
		roomService.joinRoom(guest, room.code);
		roomService.joinRoom(third, room.code);

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
			// `draw:history` ends every opening sequence; it is kept apart so
			// assertions can count the events that follow it.
			const drawHistories: DrawOperation[][] = [];
			socket.on("message", (data) => {
				const event = serverEventsSchema.parse(JSON.parse(data.toString()));
				if (event.type === "draw:history") drawHistories.push(event.operations);
				else events.push(event);
			});
			await once(socket, "open");
			await eventually(() => drawHistories.length >= 1);
			return { socket, events, drawHistories };
		}
		async function disconnect(socket: WebSocket, id: string) {
			const closed = once(socket, "close");
			socket.terminate();
			await closed;
			await eventually(() => !connections.get(id));
		}
		function spyOnSend(id: string) {
			const connection = connections.get(id);
			if (!connection) throw new Error(`Missing ${id} connection`);
			return vi.spyOn(connection.socket, "send");
		}
		return { roomService, room, connect, disconnect, spyOnSend };
	}

	it.each([
		["stroke", stroke],
		["clear", { type: "clear" }],
	])(
		"rejects a guest %s with NOT_HOST, relays nothing and keeps the host's drawing",
		async (_label, operation) => {
			const { roomService, room, connect, disconnect, spyOnSend } =
				await setup();
			const owner = await connect(host.id);
			const member = await connect(guest.id);
			const viewer = await connect(third.id);
			owner.socket.send(JSON.stringify({ type: "draw", operation: stroke }));
			await eventually(
				() => member.events.length === 2 && viewer.events.length === 2,
			);
			const hostSend = spyOnSend(host.id);
			const viewerSend = spyOnSend(third.id);

			member.socket.send(JSON.stringify({ type: "draw", operation }));
			await eventually(() => member.events.length === 3);
			expect(member.events[2]).toMatchObject({
				type: "error",
				error: { code: "NOT_HOST" },
			});
			// The error is sent after any broadcast would have been, so the
			// spies already cover the whole command.
			expect(hostSend).not.toHaveBeenCalled();
			expect(viewerSend).not.toHaveBeenCalled();
			expect(owner.events).toHaveLength(1);
			expect(viewer.events).toHaveLength(2);
			expect(roomService.getDrawingHistory(host.id, room.code)).toEqual([
				stroke,
			]);

			await disconnect(member.socket, guest.id);
			const returning = await connect(guest.id);
			expect(returning.drawHistories).toEqual([[stroke]]);
		},
	);

	it.each([
		[
			"top-level playerId",
			{ type: "draw", operation: stroke, playerId: "host" },
		],
		["top-level hostId", { type: "draw", operation: stroke, hostId: "guest" }],
		[
			"playerId inside the operation",
			{ type: "draw", operation: { ...stroke, playerId: "host" } },
		],
		[
			"playerId inside a clear",
			{ type: "draw", operation: { type: "clear", playerId: "host" } },
		],
	])(
		"rejects a forged %s as INVALID_INPUT without granting drawing rights",
		async (_label, command) => {
			const { roomService, room, connect, spyOnSend } = await setup();
			const owner = await connect(host.id);
			const member = await connect(guest.id);
			const viewer = await connect(third.id);
			roomService.applyDrawOperation(host.id, room.code, stroke);
			const hostSend = spyOnSend(host.id);
			const viewerSend = spyOnSend(third.id);

			member.socket.send(JSON.stringify(command));
			await eventually(() => member.events.length === 2);
			expect(member.events[1]).toMatchObject({
				type: "error",
				error: { code: "INVALID_INPUT" },
			});
			expect(hostSend).not.toHaveBeenCalled();
			expect(viewerSend).not.toHaveBeenCalled();
			expect(owner.events).toHaveLength(1);
			expect(viewer.events).toHaveLength(1);
			expect(roomService.getDrawingHistory(host.id, room.code)).toEqual([
				stroke,
			]);
			expect(roomService.getRoom(room.code).hostId).toBe(host.id);
		},
	);

	it.each([
		["leaves", "leave"],
		["disconnects past the grace period", "disconnect"],
	] as const)(
		"relays the new host's strokes after the host %s",
		async (_label, how) => {
			const { roomService, room, connect, disconnect, spyOnSend } =
				await setup();
			const owner = await connect(host.id);
			const member = await connect(guest.id);
			const viewer = await connect(third.id);
			if (how === "leave") {
				owner.socket.send(JSON.stringify({ type: "room:leave" }));
				await once(owner.socket, "close");
			} else {
				await disconnect(owner.socket, host.id);
				await vi.advanceTimersByTimeAsync(30_000);
			}
			await eventually(
				() => member.events.length === 2 && viewer.events.length === 2,
			);
			expect(member.events[1]).toMatchObject({
				type: "room:snapshot",
				snapshot: { hostId: guest.id },
			});

			const memberSend = spyOnSend(guest.id);
			const next: DrawOperation = { ...stroke, color: "#abcdef" };
			member.socket.send(JSON.stringify({ type: "draw", operation: next }));
			await eventually(() => viewer.events.length === 3);
			expect(viewer.events[2]).toEqual({
				type: "draw:operation",
				operation: next,
			});
			// The drawer does not get its own operation echoed back.
			expect(memberSend).not.toHaveBeenCalled();
			expect(member.events).toHaveLength(2);
			expect(roomService.getDrawingHistory(guest.id, room.code)).toEqual([
				next,
			]);

			// Other members remain viewers under the new host.
			viewer.socket.send(JSON.stringify({ type: "draw", operation: stroke }));
			await eventually(() => viewer.events.length === 4);
			expect(viewer.events[3]).toMatchObject({
				type: "error",
				error: { code: "NOT_HOST" },
			});
		},
	);
});
