import {
	currentRoomSchema,
	type ErrorCode,
	errorSchema,
	type RoomSettings,
	type RoomSnapshot,
	roomSnapshotSchema,
} from "@doodlesync/shared";
import type { z } from "zod";

import { SERVER_URL } from "./server-url";

// NETWORK is client-only: the server could not be reached or answered unexpectedly.
export type RoomApiError = { code: ErrorCode | "NETWORK"; message: string };
export type RoomApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: RoomApiError };

const networkError: RoomApiError = {
	code: "NETWORK",
	message: "Couldn’t reach the game server.",
};

async function request<T>(
	path: string,
	init: RequestInit,
	schema: z.ZodType<T> | null,
): Promise<RoomApiResult<T>> {
	let response: Response;
	try {
		// The session cookie belongs to the API origin, so it must be included.
		response = await fetch(new URL(path, SERVER_URL), {
			...init,
			credentials: "include",
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: networkError };
	}
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		const parsed = errorSchema.safeParse(
			(body as { error?: unknown } | null)?.error,
		);
		return { ok: false, error: parsed.success ? parsed.data : networkError };
	}
	if (schema === null) {
		return { ok: true, data: undefined as T };
	}
	const parsed = schema.safeParse(await response.json().catch(() => null));
	return parsed.success
		? { ok: true, data: parsed.data }
		: { ok: false, error: networkError };
}

export function createRoom(settings: RoomSettings) {
	return request<RoomSnapshot>(
		"/api/rooms",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ settings }),
		},
		roomSnapshotSchema,
	);
}

// Idempotent for members, so the room page calls it on every (re)connect.
export function joinRoom(code: string) {
	return request<RoomSnapshot>(
		`/api/rooms/${encodeURIComponent(code)}/join`,
		{ method: "POST" },
		roomSnapshotSchema,
	);
}

export function leaveRoom(code: string) {
	return request<void>(
		`/api/rooms/${encodeURIComponent(code)}/leave`,
		{ method: "POST" },
		null,
	);
}

export async function getCurrentRoomCode() {
	const result = await request(
		"/api/rooms/current",
		{ method: "GET" },
		currentRoomSchema,
	);
	return result.ok ? { ok: true as const, data: result.data.code } : result;
}

export function roomSocketUrl(code: string) {
	const url = new URL(`/api/rooms/${encodeURIComponent(code)}/ws`, SERVER_URL);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString();
}
