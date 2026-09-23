import { createRoomInputSchema, type PlayerSnapshot } from "@doodlesync/shared";
import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
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
				const room = roomService.createRoom(
					{ id: session.user.id, name: session.user.name },
					input.data,
				);
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
				onOpen: (_event, ws) => connections.attach(player.id, roomCode, ws),
				onClose: (_event, ws) => {
					connections.detach(player.id, ws);
				},
			};
		}),
	);

	return routes;
}
