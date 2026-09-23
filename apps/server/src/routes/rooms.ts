import { createRoomInputSchema, type PlayerSnapshot } from "@doodlesync/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { RoomError } from "../rooms/room-error";
import type { RoomService } from "../rooms/room-service";

export type RoomRouteDependencies = {
	corsOrigin: string;
	getSession: (headers: Headers) => Promise<{ user: PlayerSnapshot } | null>;
	roomService: RoomService;
};

export function createRoomRoutes({
	corsOrigin,
	getSession,
	roomService,
}: RoomRouteDependencies) {
	const routes = new Hono();

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
		const code = z
			.string()
			.trim()
			.toUpperCase()
			.regex(/^[A-Z2-9]{6}$/)
			.safeParse(c.req.param("code"));
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

	return routes;
}
