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
const outsiderUser = { id: "outsider", name: "Outsider" };
const settings = { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 };
const origin = "http://localhost:3001";

const brushStroke: DrawOperation = {
	type: "stroke",
	tool: "brush",
	color: "#ff0000",
	width: 0.012,
	points: [
		[0.1, 0.2],
		[0.3, 0.4],
		[0.5, 0.6],
	],
};

function stroke(index: number): DrawOperation {
	return {
		type: "stroke",
		tool: "brush",
		color: "#00aa00",
		width: 0.005,
		points: [[index / 10, 0.5]],
	};
}

// Network I/O stays real while only application timeout scheduling is advanced.
async function eventually(check: () => boolean) {
	for (let i = 0; i < 400; i++) {
		if (check()) return;
		await wait(5);
	}
	throw new Error("Timed out waiting for socket activity");
}

function drawOperations(events: ServerEvent[]) {
	return events.flatMap((event) =>
		event.type === "draw:operation" ? [event.operation] : [],
	);
}

describe("drawing relay between players", () => {
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
							? outsiderUser
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
			// `draw:history` ends every opening sequence; it is kept apart so
			// relayed `draw:operation` events can be counted on their own.
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
		function draw(socket: WebSocket, operation: DrawOperation) {
			socket.send(JSON.stringify({ type: "draw", operation }));
		}
		// Chat reaches every member, the sender included, in send order. Once the
		// sender sees its own chat message, any earlier relay to it would have
		// arrived first, so its absence is proven without a fixed sleep.
		async function barrier(
			sender: { socket: WebSocket; events: ServerEvent[] },
			text: string,
		) {
			sender.socket.send(JSON.stringify({ type: "chat:send", text }));
			await eventually(() =>
				sender.events.some(
					(event) =>
						event.type === "chat:message" && event.message.text === text,
				),
			);
		}
		return { roomService, connections, room, connect, draw, barrier };
	}

	it("relays a stroke once to the guest and not back to the sender", async () => {
		const { roomService, room, connect, draw, barrier } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		draw(owner.socket, brushStroke);
		await eventually(() => drawOperations(member.events).length === 1);
		await barrier(owner, "done");
		await eventually(() => member.events.length === 3);

		expect(member.events[1]).toEqual({
			type: "draw:operation",
			operation: brushStroke,
		});
		expect(member.events[2]).toMatchObject({ type: "chat:message" });
		expect(drawOperations(member.events)).toHaveLength(1);
		expect(drawOperations(owner.events)).toEqual([]);
		expect(owner.events.some((event) => event.type === "error")).toBe(false);
		expect(roomService.getDrawingHistory(host.id, room.code)).toEqual([
			brushStroke,
		]);
	});

	it("does not relay strokes to a player in a different room", async () => {
		const { roomService, connections, connect, draw, barrier } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		const otherRoom = roomService.createRoom(outsiderUser, { settings });
		const outsider = await connect(outsiderUser.id, otherRoom.code);
		const otherConnection = connections.get(outsiderUser.id);
		if (!otherConnection) throw new Error("Missing outsider connection");
		const sendOutside = vi.spyOn(otherConnection.socket, "send");

		draw(owner.socket, brushStroke);
		draw(owner.socket, { type: "clear" });
		await eventually(() => drawOperations(member.events).length === 2);
		await barrier(owner, "done");
		// Give any stray relay time to arrive before asserting its absence.
		await wait(50);

		expect(sendOutside).not.toHaveBeenCalled();
		expect(outsider.events).toEqual([
			{ type: "room:snapshot", snapshot: roomService.getRoom(otherRoom.code) },
		]);
		expect(outsider.drawHistories).toEqual([[]]);
		expect(
			roomService.getDrawingHistory(outsiderUser.id, otherRoom.code),
		).toEqual([]);
	});

	it("delivers several strokes to the guest in the order sent", async () => {
		const { connect, draw } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		const sent = Array.from({ length: 10 }, (_, i) => stroke(i));
		for (const operation of sent) draw(owner.socket, operation);
		await eventually(() => drawOperations(member.events).length === 10);
		expect(drawOperations(member.events)).toEqual(sent);
	});

	it("relays eraser strokes and clear operations", async () => {
		const { roomService, room, connect, draw, barrier } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		const eraser: DrawOperation = {
			type: "stroke",
			tool: "eraser",
			color: "#ffffff",
			width: 0.05,
			points: [
				[0, 0],
				[1, 1],
			],
		};
		const sent: DrawOperation[] = [brushStroke, eraser, { type: "clear" }];
		for (const operation of sent) draw(owner.socket, operation);
		await eventually(() => drawOperations(member.events).length === 3);
		await barrier(owner, "done");

		expect(drawOperations(member.events)).toEqual(sent);
		expect(drawOperations(owner.events)).toEqual([]);
		expect(roomService.getDrawingHistory(host.id, room.code)).toEqual([]);
	});

	it("keeps relaying to connected members when another member is not connected", async () => {
		const { roomService, connections, room, connect, draw } = await setup();
		const third = { id: "third", name: "Third" };
		roomService.joinRoom(third, room.code);
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		expect(connections.get(third.id)).toBeUndefined();

		draw(owner.socket, brushStroke);
		draw(owner.socket, { type: "clear" });
		await eventually(() => drawOperations(member.events).length === 2);

		expect(drawOperations(member.events)).toEqual([
			brushStroke,
			{ type: "clear" },
		]);
		expect(owner.socket.readyState).toBe(WebSocket.OPEN);
		expect(owner.events.some((event) => event.type === "error")).toBe(false);
		expect(roomService.getRoom(room.code).players).toEqual([
			host,
			guest,
			third,
		]);
	});
});
