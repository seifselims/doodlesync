import {
	clientCommandSchema,
	createRoomInputSchema,
	type PlayerSnapshot,
	type ServerEvent,
	socketCloseCodes,
} from "@doodlesync/shared";
import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { CommandRateLimiter } from "../realtime/command-rate-limiter";
import type { ConnectionRegistry } from "../realtime/connection-registry";
import { RoomError } from "../rooms/room-error";
import type { RoomService } from "../rooms/room-service";

const roomCodeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z2-9]{6}$/);

export type RoomRouteDependencies = {
	corsOrigin: string;
	getSession: (headers: Headers) => Promise<{ user: PlayerSnapshot } | null>;
	roomService: RoomService;
	connections: ConnectionRegistry;
};

// Values the socket checks hand to the upgrade handler.
type SocketVariables = {
	player: PlayerSnapshot;
	roomCode: string;
};

export function createRoomRoutes({
	corsOrigin,
	getSession,
	roomService,
	connections,
}: RoomRouteDependencies) {
	const routes = new Hono<{ Variables: SocketVariables }>();
	const commandLimiter = new CommandRateLimiter();
	const membershipTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const broadcastSnapshot = (snapshot: ReturnType<RoomService["getRoom"]>) => {
		const event: ServerEvent = {
			type: "room:snapshot",
			snapshot,
		};
		const message = JSON.stringify(event);
		for (const member of snapshot.players) {
			const connection = connections.get(member.id);
			if (!connection || connection.roomCode !== snapshot.code) {
				continue;
			}
			try {
				connection.socket.send(message);
			} catch {
				connections.detach(member.id, connection.socket);
			}
		}
	};

	// Used both before the first socket attaches and after a disconnect.
	const scheduleMembershipCleanup = (
		player: PlayerSnapshot,
		roomCode: string,
	) => {
		try {
			roomService.getRoomForMember(player.id, roomCode);
		} catch (error) {
			if (
				error instanceof RoomError &&
				(error.code === "NOT_IN_ROOM" || error.code === "ROOM_NOT_FOUND")
			) {
				return;
			}
			console.error("Unable to check membership", error);
			return;
		}
		const previousTimer = membershipTimers.get(player.id);
		if (previousTimer) clearTimeout(previousTimer);
		const timer = setTimeout(() => {
			if (membershipTimers.get(player.id) !== timer) return;
			membershipTimers.delete(player.id);
			if (connections.get(player.id)) return;
			try {
				roomService.getRoomForMember(player.id, roomCode);
				const snapshot = roomService.leaveRoom(player, roomCode);
				if (snapshot) {
					broadcastSnapshot(snapshot);
				}
			} catch (error) {
				if (
					error instanceof RoomError &&
					(error.code === "NOT_IN_ROOM" || error.code === "ROOM_NOT_FOUND")
				) {
					return;
				}
				console.error("Unable to clean up unattached membership", error);
			}
		}, 30_000);
		timer.unref();
		membershipTimers.set(player.id, timer);
	};

	routes.post(
		"/",
		async (c, next) => {
			const origin = c.req.header("Origin");
			if (origin !== undefined && origin !== corsOrigin) {
				return c.json(
					{
						error: { code: "INVALID_INPUT", message: "Origin is not allowed." },
					},
					403,
				);
			}
			return next();
		},
		bodyLimit({
			maxSize: 4096,
			onError: (c) =>
				c.json(
					{
						error: {
							code: "INVALID_INPUT",
							message: "Request body is too large.",
						},
					},
					413,
				),
		}),
		async (c) => {
			const session = await getSession(c.req.raw.headers);
			if (!session) {
				return c.json(
					{
						error: {
							code: "UNAUTHENTICATED",
							message: "Sign in to create a room.",
						},
					},
					401,
				);
			}
			if (
				c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
				"application/json"
			) {
				return c.json(
					{
						error: {
							code: "INVALID_INPUT",
							message: "Expected application/json.",
						},
					},
					415,
				);
			}
			let body: unknown;
			try {
				body = await c.req.json();
			} catch {
				return c.json(
					{ error: { code: "INVALID_INPUT", message: "Invalid JSON body." } },
					400,
				);
			}
			const input = createRoomInputSchema.safeParse(body);
			if (!input.success) {
				return c.json(
					{
						error: { code: "INVALID_INPUT", message: "Invalid room settings." },
					},
					400,
				);
			}
			try {
				const player = { id: session.user.id, name: session.user.name };
				const room = roomService.createRoom(player, input.data);
				scheduleMembershipCleanup(player, room.code);

				return c.json(room, 201);
			} catch (error) {
				if (error instanceof RoomError && error.code === "ALREADY_IN_ROOM") {
					return c.json(
						{ error: { code: error.code, message: error.message } },
						409,
					);
				}
				if (
					error instanceof RoomError &&
					error.code === "ROOM_CODE_EXHAUSTED"
				) {
					return c.json(
						{ error: { code: error.code, message: error.message } },
						503,
					);
				}
				throw error;
			}
		},
	);

	routes.get("/:code", async (c) => {
		c.header("Cache-Control", "no-store");
		const session = await getSession(c.req.raw.headers);
		if (!session) {
			return c.json(
				{
					error: {
						code: "UNAUTHENTICATED",
						message: "Sign in to view a room.",
					},
				},
				401,
			);
		}
		const code = roomCodeSchema.safeParse(c.req.param("code"));
		if (!code.success) {
			return c.json(
				{ error: { code: "INVALID_INPUT", message: "Invalid room code." } },
				400,
			);
		}
		try {
			return c.json(roomService.getRoomForMember(session.user.id, code.data));
		} catch (error) {
			if (error instanceof RoomError && error.code === "ROOM_NOT_FOUND") {
				return c.json(
					{ error: { code: error.code, message: error.message } },
					404,
				);
			}
			if (error instanceof RoomError && error.code === "NOT_IN_ROOM") {
				return c.json(
					{ error: { code: error.code, message: error.message } },
					403,
				);
			}
			throw error;
		}
	});
	routes.post("/:code/join", async (c) => {
		c.header("Cache-Control", "no-store");
		const origin = c.req.header("Origin");
		if (origin !== undefined && origin !== corsOrigin) {
			return c.json(
				{ error: { code: "INVALID_INPUT", message: "Origin is not allowed." } },
				403,
			);
		}
		const session = await getSession(c.req.raw.headers);
		if (!session) {
			return c.json(
				{
					error: {
						code: "UNAUTHENTICATED",
						message: "Sign in to join a room.",
					},
				},
				401,
			);
		}
		const code = roomCodeSchema.safeParse(c.req.param("code"));
		if (!code.success) {
			return c.json(
				{ error: { code: "INVALID_INPUT", message: "Invalid room code." } },
				400,
			);
		}
		try {
			const player = { id: session.user.id, name: session.user.name };
			const room = roomService.joinRoom(player, code.data);
			if (
				connections.get(player.id)?.roomCode !== room.code &&
				!membershipTimers.has(player.id)
			) {
				scheduleMembershipCleanup(player, room.code);
			}
			broadcastSnapshot(room);
			return c.json(room);
		} catch (error) {
			if (error instanceof RoomError && error.code === "ROOM_NOT_FOUND") {
				return c.json(
					{ error: { code: error.code, message: error.message } },
					404,
				);
			}
			if (error instanceof RoomError && error.code === "ALREADY_IN_ROOM") {
				return c.json(
					{ error: { code: error.code, message: error.message } },
					409,
				);
			}
			if (error instanceof RoomError && error.code === "ROOM_FULL") {
				return c.json(
					{ error: { code: error.code, message: error.message } },
					409,
				);
			}
			throw error;
		}
	});
	routes.get(
		"/:code/ws",
		async (c, next) => {
			c.header("Cache-Control", "no-store");
			// Browsers always send Origin on WebSocket handshakes and CORS does not
			// protect upgrades, so a missing or foreign origin is rejected.
			if (c.req.header("Origin") !== corsOrigin) {
				return c.json(
					{
						error: { code: "INVALID_INPUT", message: "Origin is not allowed." },
					},
					403,
				);
			}
			if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
				return c.json(
					{
						error: {
							code: "INVALID_INPUT",
							message: "Expected a WebSocket upgrade.",
						},
					},
					426,
				);
			}
			const session = await getSession(c.req.raw.headers);
			if (!session) {
				return c.json(
					{
						error: {
							code: "UNAUTHENTICATED",
							message: "Sign in to connect to a room.",
						},
					},
					401,
				);
			}
			const code = roomCodeSchema.safeParse(c.req.param("code"));
			if (!code.success) {
				return c.json(
					{ error: { code: "INVALID_INPUT", message: "Invalid room code." } },
					400,
				);
			}
			try {
				roomService.getRoomForMember(session.user.id, code.data);
			} catch (error) {
				if (error instanceof RoomError && error.code === "ROOM_NOT_FOUND") {
					return c.json(
						{ error: { code: error.code, message: error.message } },
						404,
					);
				}
				if (error instanceof RoomError && error.code === "NOT_IN_ROOM") {
					return c.json(
						{ error: { code: error.code, message: error.message } },
						403,
					);
				}
				throw error;
			}
			// Identity is fixed here from the session; socket messages never supply it.
			c.set("player", { id: session.user.id, name: session.user.name });
			c.set("roomCode", code.data);
			return next();
		},
		// Runs only after every check above passed.
		upgradeWebSocket((c) => {
			const player = c.get("player");
			const roomCode = c.get("roomCode");
			return {
				onOpen: (_event, ws) => {
					const snapshot = roomService.getRoomForMember(player.id, roomCode);
					connections.attach(player.id, roomCode, ws);
					const timer = membershipTimers.get(player.id);
					if (timer) {
						clearTimeout(timer);
						membershipTimers.delete(player.id);
					}
					const event: ServerEvent = { type: "room:snapshot", snapshot };
					ws.send(JSON.stringify(event));
				},
				onClose: (_event, ws) => {
					const detached = connections.detach(player.id, ws);
					if (!detached) {
						return;
					}
					scheduleMembershipCleanup(player, roomCode);
				},
				onMessage: (message, ws) => {
					const reject = (message: string) => {
						const event: ServerEvent = {
							type: "error",
							error: {
								code: "INVALID_INPUT",
								message,
							},
						};
						ws.send(JSON.stringify(event));
					};
					if (connections.get(player.id)?.socket !== ws) {
						return;
					}
					if (!commandLimiter.allow(player.id)) {
						ws.close(
							socketCloseCodes.rateLimited,
							"Too many commands. Please wait before reconnecting. ",
						);
						return;
					}
					if (typeof message.data !== "string") {
						reject("Expected a JSON text message. ");
						return;
					}
					let input: unknown;
					try {
						input = JSON.parse(message.data);
					} catch {
						reject("Invalid JSON. ");
						return;
					}
					const result = clientCommandSchema.safeParse(input);
					if (!result.success) {
						reject("Invalid or unknown command. ");
						return;
					}
					const command = result.data;
					try {
						switch (command.type) {
							case "room:leave": {
								roomService.getRoomForMember(player.id, roomCode);
								const snapshot = roomService.leaveRoom(player, roomCode);
								if (snapshot) {
									broadcastSnapshot(snapshot);
								}
								const event: ServerEvent = { type: "room:left" };
								ws.send(JSON.stringify(event));
								ws.close(1000, "Left room. ");
								break;
							}
							case "room:update-settings": {
								const snapshot = roomService.updateSettings(
									player.id,
									roomCode,
									command.settings,
								);
								broadcastSnapshot(snapshot);
								break;
							}
						}
					} catch (error) {
						if (error instanceof RoomError) {
							const event: ServerEvent = {
								type: "error",
								error: {
									code: error.code,
									message: error.message,
								},
							};
							ws.send(JSON.stringify(event));
							return;
						}
						console.error("WebSocket command failed. ");
						ws.close(1011, "Unable to process command. ");
					}
				},
			};
		}),
	);

	return routes;
}
