import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import {
	DRAW_HISTORY_MAX_POINTS,
	DRAW_MAX_POINTS,
	type DrawOperation,
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

function strokeOf(pointCount: number, x = 0.5): DrawOperation {
	return {
		type: "stroke",
		tool: "brush",
		color: "#1b1f3b",
		width: 0.012,
		points: Array.from({ length: pointCount }, (_, i) => [x, (i % 100) / 100]),
	};
}
const validStroke = strokeOf(3);
const drawMessage = (operation: unknown) =>
	JSON.stringify({ type: "draw", operation });

// Network I/O stays real while only application timeout scheduling is advanced.
async function eventually(check: () => boolean) {
	for (let i = 0; i < 400; i++) {
		if (check()) return;
		await wait(5);
	}
	throw new Error("Timed out waiting for socket activity");
}

const ofType = <T extends ServerEvent["type"]>(
	events: ServerEvent[],
	type: T,
) =>
	events.filter(
		(event): event is Extract<ServerEvent, { type: T }> => event.type === type,
	);

describe("drawing message limits over live sockets", () => {
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
			vi.restoreAllMocks();
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
				user: headers.get("Cookie") === "guest" ? guest : host,
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
			socket.on("message", (data) => {
				const event = serverEventsSchema.parse(JSON.parse(data.toString()));
				if (event.type === "draw:history") drawHistories.push(event.operations);
				else events.push(event);
			});
			await once(socket, "open");
			await eventually(() => drawHistories.length >= 1);
			return { socket, events, drawHistories };
		}
		const history = () => roomService.getDrawingHistory(host.id, room.code);
		return { roomService, room, connect, history };
	}

	it.each([
		["an out-of-range coordinate", { ...validStroke, points: [[1.5, 0.5]] }],
		["a negative coordinate", { ...validStroke, points: [[0.5, -0.01]] }],
		["too many points", strokeOf(DRAW_MAX_POINTS + 1)],
		["no points", { ...validStroke, points: [] }],
		["a named color", { ...validStroke, color: "red" }],
		["an uppercase color", { ...validStroke, color: "#FFFFFF" }],
		["a zero width", { ...validStroke, width: 0 }],
		["a huge width", { ...validStroke, width: 5 }],
		["an unknown tool", { ...validStroke, tool: "fill" }],
		["an unknown operation", { type: "undo" }],
		["a forged player id", { ...validStroke, playerId: guest.id }],
	])(
		"rejects a stroke with %s without relaying or storing it",
		async (_label, operation) => {
			const { connect, history } = await setup();
			const owner = await connect(host.id);
			const member = await connect(guest.id);
			const before = history();

			owner.socket.send(drawMessage(operation));
			await eventually(() => ofType(owner.events, "error").length === 1);
			expect(ofType(owner.events, "error")[0]?.error.code).toBe(
				"INVALID_INPUT",
			);
			expect(history()).toEqual(before);

			// The socket stays usable and the next valid stroke is the first relayed.
			owner.socket.send(drawMessage(validStroke));
			await eventually(
				() => ofType(member.events, "draw:operation").length > 0,
			);
			expect(ofType(member.events, "draw:operation")).toEqual([
				{ type: "draw:operation", operation: validStroke },
			]);
			expect(history()).toEqual([...before, validStroke]);
			expect(owner.socket.readyState).toBe(WebSocket.OPEN);
		},
	);

	it.each([
		["a missing operation", JSON.stringify({ type: "draw" })],
		["a null operation", JSON.stringify({ type: "draw", operation: null })],
		[
			"an extra command field",
			JSON.stringify({ type: "draw", operation: validStroke, playerId: "x" }),
		],
	])("rejects a draw command with %s", async (_label, payload) => {
		const { connect, history } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);

		owner.socket.send(payload);
		await eventually(() => ofType(owner.events, "error").length === 1);
		expect(ofType(owner.events, "error")[0]?.error.code).toBe("INVALID_INPUT");
		expect(history()).toEqual([]);

		owner.socket.send(drawMessage({ type: "clear" }));
		await eventually(() => ofType(member.events, "draw:operation").length > 0);
		expect(ofType(member.events, "draw:operation")).toEqual([
			{ type: "draw:operation", operation: { type: "clear" } },
		]);
	});

	it("accepts and relays a stroke with exactly the maximum points", async () => {
		const { connect, history } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		const longest = strokeOf(DRAW_MAX_POINTS);

		owner.socket.send(drawMessage(longest));
		await eventually(() => ofType(member.events, "draw:operation").length > 0);
		expect(ofType(member.events, "draw:operation")).toEqual([
			{ type: "draw:operation", operation: longest },
		]);
		expect(history()).toEqual([longest]);
		expect(ofType(owner.events, "error")).toEqual([]);
	});

	it("closes the socket for a message over 16 KB and stores nothing", async () => {
		const { connect, history } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		// Valid JSON and a valid stroke, only padded past the payload limit.
		const payload = drawMessage(validStroke) + " ".repeat(16 * 1024);
		const closed = once(owner.socket, "close");

		owner.socket.send(payload);
		const [code] = await closed;
		expect(code).toBe(1009);
		await wait(50);
		expect(history()).toEqual([]);
		expect(ofType(member.events, "draw:operation")).toEqual([]);
	});

	it("closes a draw flood with the rate-limit code after the burst", async () => {
		// Freeze only the limiter's clock so no tokens refill during the burst.
		vi.spyOn(performance, "now").mockReturnValue(0);
		const { connect, history } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		const closed = once(owner.socket, "close");

		for (let i = 0; i < 70; i++) {
			owner.socket.send(drawMessage(strokeOf(1, i / 100)));
		}
		const [code] = await closed;
		expect(code).toBe(socketCloseCodes.rateLimited);
		await eventually(
			() => ofType(member.events, "draw:operation").length >= 60,
		);
		await wait(50);
		expect(ofType(member.events, "draw:operation")).toHaveLength(60);
		expect(history()).toHaveLength(60);
		expect(history()).not.toContainEqual(strokeOf(1, 60 / 100));
	});

	it("keeps a socket open at a steady drawing pace and leaves the general budget alone", async () => {
		let now = 0;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const { roomService, room, connect, history } = await setup();
		const owner = await connect(host.id);
		const member = await connect(guest.id);

		// 100 strokes at 20 per second: more than the burst, under the refill.
		for (let i = 0; i < 100; i++) {
			now += 50;
			owner.socket.send(drawMessage(strokeOf(2, i / 100)));
			await eventually(
				() => ofType(member.events, "draw:operation").length === i + 1,
			);
		}
		expect(history()).toHaveLength(100);
		expect(owner.socket.readyState).toBe(WebSocket.OPEN);

		// Drawing did not spend chat's budget: a full chat burst still goes through.
		for (let i = 0; i < 10; i++) {
			owner.socket.send(JSON.stringify({ type: "chat:send", text: `hi ${i}` }));
		}
		await eventually(() => ofType(member.events, "chat:message").length === 10);
		expect(roomService.getChatHistory(host.id, room.code)).toHaveLength(10);
		expect(owner.socket.readyState).toBe(WebSocket.OPEN);
	});

	it("still closes malformed non-draw spam after the general burst of 10", async () => {
		vi.spyOn(performance, "now").mockReturnValue(0);
		const { connect } = await setup();
		const owner = await connect(host.id);
		const closed = once(owner.socket, "close");

		for (let i = 0; i < 11; i++) owner.socket.send("{");
		const [code] = await closed;
		expect(code).toBe(socketCloseCodes.rateLimited);
		expect(ofType(owner.events, "error")).toHaveLength(10);
	});

	it("rejects strokes past the canvas budget until the canvas is cleared", async () => {
		const { roomService, room, connect, history } = await setup();
		// Seed all but the last 80 points directly to keep the test fast.
		const seeded = DRAW_HISTORY_MAX_POINTS - 80;
		for (let total = 0; total < seeded; total += DRAW_MAX_POINTS) {
			roomService.applyDrawOperation(
				host.id,
				room.code,
				strokeOf(Math.min(DRAW_MAX_POINTS, seeded - total)),
			);
		}
		const owner = await connect(host.id);
		const member = await connect(guest.id);
		const relayed = () => ofType(member.events, "draw:operation");
		const pointsStored = () =>
			history().reduce(
				(sum, op) => sum + (op.type === "stroke" ? op.points.length : 0),
				0,
			);
		expect(pointsStored()).toBe(seeded);

		// The last strokes fill the canvas to exactly the limit.
		owner.socket.send(drawMessage(strokeOf(40)));
		owner.socket.send(drawMessage(strokeOf(40)));
		await eventually(() => relayed().length === 2);
		expect(pointsStored()).toBe(DRAW_HISTORY_MAX_POINTS);
		const full = history();

		owner.socket.send(drawMessage(strokeOf(1, 0.9)));
		await eventually(() => ofType(owner.events, "error").length === 1);
		expect(ofType(owner.events, "error")[0]?.error.code).toBe("CANVAS_FULL");
		expect(history()).toEqual(full);

		owner.socket.send(drawMessage({ type: "clear" }));
		owner.socket.send(drawMessage(validStroke));
		await eventually(() => relayed().length === 4);
		expect(relayed().map((event) => event.operation)).toEqual([
			strokeOf(40),
			strokeOf(40),
			{ type: "clear" },
			validStroke,
		]);
		expect(history()).toEqual([validStroke]);
	});
});
