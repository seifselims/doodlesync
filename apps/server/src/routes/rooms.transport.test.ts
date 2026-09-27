import {
	roomSnapshotSchema,
	serverEventsSchema,
	socketCloseCodes,
} from "@doodlesync/shared";
import { type ServerType, serve } from "@hono/node-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createApp } from "../app";
import { ConnectionRegistry } from "../realtime/connection-registry";
import { RoomError } from "../rooms/room-error";
import { RoomService } from "../rooms/room-service";

const user = { id: "user-1", name: "Seif" };
const settings = { maxPlayers: 8, rounds: 3, drawTimeSeconds: 60 };
const corsOrigin = "http://localhost:3001";
function setup(authenticated = true) {
	const roomService = new RoomService();
	const getSession = vi.fn(async (_headers: Headers) =>
		authenticated ? { user } : null,
	);
	const create = vi.spyOn(roomService, "createRoom");
	const connections = new ConnectionRegistry();
	const app = createApp({
		corsOrigin,
		getSession,
		roomService,
		connections,
		authHandler: async () => new Response(),
	});
	const post = (
		body = JSON.stringify({ settings }),
		headers: Record<string, string> = {},
	) =>
		app.request("/api/rooms", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: "session=test",
				Origin: corsOrigin,
				...headers,
			},
			body,
		});
	return { app, post, create, getSession, roomService, connections };
}

describe("POST /api/rooms", () => {
	it("creates a stored room from session identity and forwards session headers", async () => {
		const { post, roomService, getSession } = setup();
		const response = await post();
		expect(response.status).toBe(201);
		const room = roomSnapshotSchema.parse(await response.json());
		expect(room.players).toEqual([user]);
		expect(room.hostId).toBe(user.id);
		expect(roomService.getRoom(room.code)).toEqual(room);
		expect(getSession.mock.calls[0]?.[0].get("Cookie")).toBe("session=test");
	});
	it("rejects unauthenticated requests before creation", async () => {
		const { post, create } = setup(false);
		const response = await post();
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			error: { code: "UNAUTHENTICATED" },
		});
		expect(create).not.toHaveBeenCalled();
	});
	it.each([
		"{",
		"null",
		"{}",
		JSON.stringify({ settings, playerId: "forged" }),
		JSON.stringify({ settings: { ...settings, maxPlayers: 99 } }),
	])("rejects invalid input %s", async (body) => {
		const { post, create } = setup();
		expect((await post(body)).status).toBe(400);
		expect(create).not.toHaveBeenCalled();
	});
	it("rejects a second room with a stable conflict error", async () => {
		const { post } = setup();
		expect((await post()).status).toBe(201);
		const response = await post();
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: { code: "ALREADY_IN_ROOM" },
		});
	});
	it("maps code exhaustion to a retryable response", async () => {
		const { post, create } = setup();
		create.mockImplementation(() => {
			throw new RoomError("ROOM_CODE_EXHAUSTED", "Try again later.");
		});
		const response = await post();
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			error: { code: "ROOM_CODE_EXHAUSTED" },
		});
	});
	it("rejects foreign origins before session lookup or mutation", async () => {
		const { post, create, getSession } = setup();
		expect(
			(await post(undefined, { Origin: "https://untrusted.example" })).status,
		).toBe(403);
		expect(create).not.toHaveBeenCalled();
		expect(getSession).not.toHaveBeenCalled();
	});
	it("rejects oversized bodies and unsupported content types", async () => {
		const { post, create } = setup();
		expect((await post(" ".repeat(4097))).status).toBe(413);
		expect(
			(await post(undefined, { "Content-Type": "text/plain" })).status,
		).toBe(415);
		expect(create).not.toHaveBeenCalled();
	});
});

describe("POST /api/rooms/:code/join", () => {
	it("joins using session identity, broadcasts and allows repeated joins", async () => {
		const { app, roomService, connections } = setup();
		const owner = { id: "owner", name: "Owner" };
		const room = roomService.createRoom(owner, { settings });
		const socket = { send: vi.fn(), close: vi.fn() };
		connections.attach(owner.id, room.code, socket);
		const response = await app.request(
			`/api/rooms/${room.code.toLowerCase()}/join`,
			{
				method: "POST",
				body: JSON.stringify({ playerId: "forged" }),
			},
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		const snapshot = roomSnapshotSchema.parse(await response.json());
		expect(snapshot.players).toEqual([owner, user]);
		expect(JSON.parse(socket.send.mock.calls[0]?.[0])).toEqual({
			type: "room:snapshot",
			snapshot,
		});
		expect(
			(await app.request(`/api/rooms/${room.code}/join`, { method: "POST" }))
				.status,
		).toBe(200);
		expect(roomService.getRoom(room.code).players).toHaveLength(2);
	});
	it("does not extend the attachment deadline on repeated joins", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const { app, roomService } = setup();
			const room = roomService.createRoom(
				{ id: "owner", name: "Owner" },
				{ settings },
			);
			const join = () =>
				app.request(`/api/rooms/${room.code}/join`, { method: "POST" });
			expect((await join()).status).toBe(200);
			await vi.advanceTimersByTimeAsync(29_999);
			expect((await join()).status).toBe(200);
			await vi.advanceTimersByTimeAsync(1);
			expect(() => roomService.getRoomForMember(user.id, room.code)).toThrow(
				"You are not a member",
			);
		} finally {
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it("returns stable errors for authentication, invalid codes and missing rooms", async () => {
		expect(
			(
				await setup(false).app.request("/api/rooms/ABC234/join", {
					method: "POST",
				})
			).status,
		).toBe(401);
		const { app } = setup();
		for (const [code, status, error] of [
			["invalid", 400, "INVALID_INPUT"],
			["ABC234", 404, "ROOM_NOT_FOUND"],
		] as const) {
			const response = await app.request(`/api/rooms/${code}/join`, {
				method: "POST",
			});
			expect(response.status).toBe(status);
			expect(await response.json()).toMatchObject({ error: { code: error } });
		}
	});
	it("returns 409 for full rooms and membership in another room", async () => {
		const { app, roomService } = setup();
		const room = roomService.createRoom(
			{ id: "owner", name: "Owner" },
			{ settings: { ...settings, maxPlayers: 2 } },
		);
		roomService.joinRoom({ id: "guest", name: "Guest" }, room.code);
		const full = await app.request(`/api/rooms/${room.code}/join`, {
			method: "POST",
		});
		expect(full.status).toBe(409);
		expect(await full.json()).toMatchObject({ error: { code: "ROOM_FULL" } });
		roomService.createRoom(user, { settings });
		const conflict = await app.request(`/api/rooms/${room.code}/join`, {
			method: "POST",
		});
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({
			error: { code: "ALREADY_IN_ROOM" },
		});
	});
	it("rejects foreign origins before authentication or joining", async () => {
		const { app, getSession, roomService } = setup();
		const join = vi.spyOn(roomService, "joinRoom");
		const response = await app.request("/api/rooms/ABC234/join", {
			method: "POST",
			headers: { Origin: "https://evil.example" },
		});
		expect(response.status).toBe(403);
		expect(getSession).not.toHaveBeenCalled();
		expect(join).not.toHaveBeenCalled();
	});
});

describe("GET /api/rooms/:code", () => {
	it("returns a normalized member snapshot without caching it", async () => {
		const { app, roomService, getSession } = setup();
		const room = roomService.createRoom(user, { settings });
		const response = await app.request(
			`/api/rooms/${room.code.toLowerCase()}`,
			{ headers: { Cookie: "session=test" } },
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(room);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(getSession.mock.calls[0]?.[0].get("Cookie")).toBe("session=test");
	});
	it("rejects unauthenticated lookup before calling the service", async () => {
		const { app, roomService } = setup(false);
		const lookup = vi.spyOn(roomService, "getRoomForMember");
		const response = await app.request("/api/rooms/ABC234");
		expect(response.status).toBe(401);
		expect(lookup).not.toHaveBeenCalled();
	});
	it("rejects a nonmember despite forged identity and does not join them", async () => {
		const { app, roomService } = setup();
		const owner = { id: "other", name: "Omar" };
		const room = roomService.createRoom(owner, { settings });
		const response = await app.request(
			`/api/rooms/${room.code}?playerId=other`,
			{ headers: { userId: "other" } },
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: {
				code: "NOT_IN_ROOM",
				message: "You are not a member of this room.",
			},
		});
		expect(roomService.getRoom(room.code)).toEqual(room);
	});
	it("returns 404 for a missing room and 400 for an invalid code", async () => {
		const { app } = setup();
		const missing = await app.request("/api/rooms/ABC234");
		expect(missing.status).toBe(404);
		expect(await missing.json()).toMatchObject({
			error: { code: "ROOM_NOT_FOUND" },
		});
		expect((await app.request("/api/rooms/invalid-code")).status).toBe(400);
	});
	it("allows a joined guest and revokes access after they leave", async () => {
		const { app, roomService } = setup();
		const room = roomService.createRoom(
			{ id: "other", name: "Omar" },
			{ settings },
		);
		roomService.joinRoom(user, room.code);
		expect((await app.request(`/api/rooms/${room.code}`)).status).toBe(200);
		roomService.leaveRoom(user, room.code);
		expect((await app.request(`/api/rooms/${room.code}`)).status).toBe(403);
	});
});

describe("GET /api/rooms/:code/ws", () => {
	const connect = (
		app: ReturnType<typeof setup>["app"],
		code = "ABC234",
		headers: Record<string, string | undefined> = {},
	) =>
		app.request(`/api/rooms/${code}/ws`, {
			headers: Object.fromEntries(
				Object.entries({
					Connection: "Upgrade",
					Upgrade: "websocket",
					Cookie: "session=test",
					Origin: corsOrigin,
					...headers,
				}).filter((entry): entry is [string, string] => entry[1] !== undefined),
			),
		});
	it.each([
		["a foreign origin", "https://evil.example"],
		["a missing origin", undefined],
	])("rejects %s before checking the session", async (_label, origin) => {
		const { app, getSession } = setup();
		const response = await connect(app, "ABC234", { Origin: origin });
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			error: { code: "INVALID_INPUT" },
		});
		expect(getSession).not.toHaveBeenCalled();
	});
	it("requires a WebSocket upgrade", async () => {
		const { app, getSession } = setup();
		const response = await connect(app, "ABC234", { Upgrade: undefined });
		expect(response.status).toBe(426);
		expect(getSession).not.toHaveBeenCalled();
	});
	it("rejects unauthenticated upgrades and forwards session headers", async () => {
		const { app, getSession } = setup(false);
		const response = await connect(app);
		expect(response.status).toBe(401);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(getSession.mock.calls[0]?.[0].get("Cookie")).toBe("session=test");
	});
	it("rejects invalid codes, missing rooms and nonmembers", async () => {
		const { app, roomService } = setup();
		const room = roomService.createRoom(
			{ id: "other", name: "Omar" },
			{ settings },
		);
		expect((await connect(app, "invalid-code")).status).toBe(400);
		expect((await connect(app, "ABC234")).status).toBe(404);
		const nonmember = await connect(app, room.code);
		expect(nonmember.status).toBe(403);
		expect(await nonmember.json()).toMatchObject({
			error: { code: "NOT_IN_ROOM" },
		});
	});
});

describe("GET /api/rooms/:code/ws on a live server", () => {
	let server: ServerType | undefined;
	afterEach(async () => {
		await new Promise((resolve) => server?.close(resolve) ?? resolve(null));
		server = undefined;
	});
	async function listen() {
		const context = setup();
		const webSocketServer = new WebSocketServer({ noServer: true });
		const port = await new Promise<number>((resolve) => {
			server = serve(
				{
					fetch: context.app.fetch,
					port: 0,
					websocket: { server: webSocketServer },
				},
				(info) => resolve(info.port),
			);
		});
		return { ...context, port };
	}
	const open = (port: number, code: string, origin = corsOrigin) =>
		new Promise<{ socket?: WebSocket; status?: number }>((resolve) => {
			const socket = new WebSocket(
				`ws://localhost:${port}/api/rooms/${code}/ws`,
				{
					headers: { Origin: origin, Cookie: "session=test" },
				},
			);
			socket.once("open", () => resolve({ socket }));
			socket.once("unexpected-response", (_request, response) =>
				resolve({ status: response.statusCode }),
			);
		});
	it("opens a connection for a room member", async () => {
		const { port, roomService } = await listen();
		const room = roomService.createRoom(user, { settings });
		const { socket } = await open(port, room.code);
		expect(socket?.readyState).toBe(WebSocket.OPEN);
		socket?.terminate();
	});
	it("counts malformed messages, blocks mutations when limited and preserves allowance across reconnects", async () => {
		// Freeze only the limiter's clock; network events and test timers stay real.
		const clock = vi.spyOn(performance, "now").mockReturnValue(0);
		const sockets: WebSocket[] = [];
		try {
			const { port, roomService } = await listen();
			const room = roomService.createRoom(user, { settings });
			const update = vi.spyOn(roomService, "updateSettings");
			const leave = vi.spyOn(roomService, "leaveRoom");
			const { socket: first } = await open(port, room.code);
			if (!first) throw new Error("Expected an open socket");
			sockets.push(first);
			const errors: unknown[] = [];
			first.on("message", (data) => {
				const event = serverEventsSchema.parse(JSON.parse(data.toString()));
				if (event.type === "error") errors.push(event.error.code);
			});
			const firstClosed = new Promise<number>((resolve) =>
				first.once("close", resolve),
			);
			for (let i = 0; i < 10; i++) first.send("{");
			first.send(
				JSON.stringify({
					type: "room:update-settings",
					settings: { ...settings, rounds: 5 },
				}),
			);
			expect(await firstClosed).toBe(socketCloseCodes.rateLimited);
			expect(errors).toEqual(Array(10).fill("INVALID_INPUT"));
			expect(update).not.toHaveBeenCalled();
			expect(roomService.getRoom(room.code)).toEqual(room);

			const { socket: second } = await open(port, room.code);
			if (!second) throw new Error("Expected an open replacement socket");
			sockets.push(second);
			const secondClosed = new Promise<number>((resolve) =>
				second.once("close", resolve),
			);
			second.send(JSON.stringify({ type: "room:leave" }));
			expect(await secondClosed).toBe(socketCloseCodes.rateLimited);
			expect(leave).not.toHaveBeenCalled();
			expect(roomService.getRoom(room.code)).toEqual(room);
		} finally {
			for (const socket of sockets) socket.terminate();
			clock.mockRestore();
		}
	});
	it("sends the current public snapshot as the first message on connection", async () => {
		const { port, roomService } = await listen();
		const room = roomService.createRoom(user, { settings });
		roomService.joinRoom({ id: "other", name: "Omar" }, room.code);
		const socket = new WebSocket(
			`ws://localhost:${port}/api/rooms/${room.code}/ws`,
			{ headers: { Origin: corsOrigin, Cookie: "session=test" } },
		);
		try {
			const event = await new Promise<unknown>((resolve, reject) => {
				socket.once("message", (data) => resolve(JSON.parse(data.toString())));
				socket.once("error", reject);
			});
			expect(serverEventsSchema.parse(event)).toEqual({
				type: "room:snapshot",
				snapshot: roomService.getRoomForMember(user.id, room.code),
			});
		} finally {
			socket.terminate();
		}
	});
	it("refuses the handshake with the rejection status", async () => {
		const { port, roomService } = await listen();
		const room = roomService.createRoom(user, { settings });
		expect(await open(port, room.code, "https://evil.example")).toEqual({
			status: 403,
		});
		const other = roomService.createRoom(
			{ id: "other", name: "Omar" },
			{ settings },
		);
		expect(await open(port, other.code)).toEqual({ status: 403 });
	});
	it("closes the older connection when the same player connects again", async () => {
		const { port, roomService, connections } = await listen();
		const room = roomService.createRoom(user, { settings });
		const detach = vi.spyOn(connections, "detach");
		const { socket: first } = await open(port, room.code);
		const firstClosed = new Promise<number>((resolve) =>
			first?.once("close", resolve),
		);
		const { socket: second } = await open(port, room.code);
		expect(await firstClosed).toBe(socketCloseCodes.replaced);
		expect(second?.readyState).toBe(WebSocket.OPEN);
		// Wait for the server to handle the old socket's close: it must be
		// ignored and must not remove the replacement.
		await vi.waitFor(() => expect(detach).toHaveReturnedWith(false));
		expect(connections.get(user.id)?.roomCode).toBe(room.code);

		const secondClosed = new Promise((resolve) =>
			second?.once("close", resolve),
		);
		second?.close();
		await secondClosed;
		await vi.waitFor(() => expect(connections.get(user.id)).toBeUndefined());
	});
});
