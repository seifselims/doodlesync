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
const outsider = { id: "outsider", name: "Outsider" };
const settings = { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 };
const origin = "http://localhost:3001";

function stroke(color: string, ...points: [number, number][]): DrawOperation {
	return { type: "stroke", tool: "brush", color, width: 0.012, points };
}

const clear: DrawOperation = { type: "clear" };

// Network I/O stays real while only application timeout scheduling is advanced.
async function eventually(check: () => boolean) {
	for (let i = 0; i < 400; i++) {
		if (check()) return;
		await wait(5);
	}
	throw new Error("Timed out waiting for socket activity");
}

describe("stored drawing history over live sockets", () => {
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
				user:
					headers.get("Cookie") === "guest"
						? guest
						: headers.get("Cookie") === "outsider"
							? outsider
							: host,
			}),
			authHandler: async () => new Response(),
		});
		const room = roomService.createRoom(host, { settings });
		roomService.joinRoom(guest, room.code);

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
			const drawHistories: DrawOperation[][] = [];
			// Every message type in arrival order, including draw:history.
			const order: string[] = [];
			socket.on("message", (data) => {
				const event = serverEventsSchema.parse(JSON.parse(data.toString()));
				order.push(event.type);
				if (event.type === "draw:history") drawHistories.push(event.operations);
				else events.push(event);
			});
			await once(socket, "open");
			await eventually(() => drawHistories.length >= 1);
			return { socket, events, drawHistories, order };
		}
		async function disconnect(socket: WebSocket, id: string) {
			const closed = once(socket, "close");
			socket.terminate();
			await closed;
			await eventually(() => !connections.get(id));
		}
		function draw(socket: WebSocket, operation: DrawOperation) {
			socket.send(JSON.stringify({ type: "draw", operation }));
		}
		return { roomService, connections, room, connect, disconnect, draw };
	}

	it("sends a late-joining guest the host's strokes in order", async () => {
		const { roomService, room, connect, draw } = await setup();
		const owner = await connect(host.id);
		expect(owner.drawHistories).toEqual([[]]);
		const strokes = [
			stroke("#ff0000", [0, 0], [0.5, 0.5]),
			stroke("#00ff00", [0.1, 0.2]),
			stroke("#0000ff", [1, 1], [0.9, 0.8], [0.7, 0.6]),
		];
		for (const operation of strokes) draw(owner.socket, operation);
		await eventually(
			() => roomService.getDrawingHistory(host.id, room.code).length === 3,
		);

		const member = await connect(guest.id);
		expect(member.drawHistories).toEqual([strokes]);
		expect(owner.events).toHaveLength(1);
	});

	it("sends an empty history to a socket that connects after a clear", async () => {
		const { roomService, room, connect, draw } = await setup();
		const owner = await connect(host.id);
		draw(owner.socket, stroke("#ff0000", [0.2, 0.2]));
		draw(owner.socket, stroke("#00ff00", [0.3, 0.3]));
		await eventually(
			() => roomService.getDrawingHistory(host.id, room.code).length === 2,
		);
		draw(owner.socket, clear);
		await eventually(
			() => roomService.getDrawingHistory(host.id, room.code).length === 0,
		);

		const member = await connect(guest.id);
		expect(member.drawHistories).toEqual([[]]);
	});

	it("replaces a reconnecting socket's canvas with exactly the current history", async () => {
		const { roomService, room, connect, disconnect, draw } = await setup();
		const owner = await connect(host.id);
		const before = stroke("#ff0000", [0.1, 0.1]);
		draw(owner.socket, before);
		await eventually(
			() => roomService.getDrawingHistory(host.id, room.code).length === 1,
		);
		const first = await connect(guest.id);
		expect(first.drawHistories).toEqual([[before]]);
		await disconnect(first.socket, guest.id);

		// Missed while disconnected: a stroke, a clear, then one surviving stroke.
		draw(owner.socket, stroke("#00ff00", [0.2, 0.2]));
		draw(owner.socket, clear);
		const after = stroke("#0000ff", [0.3, 0.3], [0.4, 0.4]);
		draw(owner.socket, after);
		await eventually(() => {
			const history = roomService.getDrawingHistory(host.id, room.code);
			return history.length === 1 && history[0]?.type === "stroke"
				? history[0].color === "#0000ff"
				: false;
		});

		const returning = await connect(guest.id);
		expect(returning.drawHistories).toEqual([[after]]);
		expect(returning.events.map((event) => event.type)).toEqual([
			"room:snapshot",
		]);
		// The closed socket got nothing more after its own opening history.
		expect(first.drawHistories).toEqual([[before]]);
	});

	it("sends draw:history after room:snapshot and chat:history", async () => {
		const { roomService, room, connect } = await setup();
		roomService.applyDrawOperation(
			host.id,
			room.code,
			stroke("#ff0000", [0, 1]),
		);
		const withoutChat = await connect(guest.id);
		expect(withoutChat.order).toEqual(["room:snapshot", "draw:history"]);

		roomService.postChatMessage(host, room.code, "hello");
		const withChat = await connect(host.id);
		expect(withChat.order).toEqual([
			"room:snapshot",
			"chat:history",
			"draw:history",
		]);
		expect(withChat.drawHistories).toEqual([[stroke("#ff0000", [0, 1])]]);
	});

	it("sends each room only its own drawing history", async () => {
		const { roomService, room, connect, draw } = await setup();
		const otherRoom = roomService.createRoom(outsider, { settings });
		const elsewhere = stroke("#00ff00", [0.9, 0.9]);
		roomService.applyDrawOperation(outsider.id, otherRoom.code, elsewhere);
		const here = stroke("#ff0000", [0.1, 0.1]);
		roomService.applyDrawOperation(host.id, room.code, here);

		const owner = await connect(host.id);
		const other = await connect(outsider.id, otherRoom.code);
		expect(owner.drawHistories).toEqual([[here]]);
		expect(other.drawHistories).toEqual([[elsewhere]]);

		// A clear in one room does not reach or change the other room.
		draw(owner.socket, clear);
		await eventually(
			() => roomService.getDrawingHistory(host.id, room.code).length === 0,
		);
		await wait(50);
		expect(other.order).toEqual(["room:snapshot", "draw:history"]);
		expect(roomService.getDrawingHistory(outsider.id, otherRoom.code)).toEqual([
			elsewhere,
		]);
	});
});
