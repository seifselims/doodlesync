import { roomSnapshotSchema } from "@doodlesync/shared";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
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
	const app = createApp({
		corsOrigin,
		getSession,
		roomService,
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
	return { app, post, create, getSession, roomService };
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
