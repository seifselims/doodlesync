"use client";

import {
	CHAT_HISTORY_LIMIT,
	type ChatMessage,
	type ClientCommand,
	type RoomSnapshot,
	serverEventsSchema,
	socketCloseCodes,
} from "@doodlesync/shared";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { joinRoom, type RoomApiError, roomSocketUrl } from "@/lib/rooms-api";

export type ConnectionState =
	| "connecting"
	| "connected"
	| "reconnecting"
	| "disconnected";

// Why the lobby cannot be shown or kept live; each has its own recovery action.
export type RoomBlocker =
	| { kind: "error"; error: RoomApiError }
	| { kind: "replaced" }
	| { kind: "unreachable" }
	| { kind: "removed" };

const MAX_RETRIES = 6;

function retryDelay(attempt: number) {
	return Math.min(1000 * 2 ** (attempt - 1), 10_000);
}

// Toasts the difference between two snapshots: joins, leaves and host changes.
function announceChanges(
	previous: RoomSnapshot | null,
	next: RoomSnapshot,
	userId: string,
) {
	if (!previous) return;
	const before = new Map(previous.players.map((player) => [player.id, player]));
	const after = new Set(next.players.map((player) => player.id));
	for (const player of next.players) {
		if (!before.has(player.id) && player.id !== userId) {
			toast(`${player.name} joined the room`);
		}
	}
	for (const player of previous.players) {
		if (!after.has(player.id) && player.id !== userId) {
			toast(`${player.name} left the room`);
		}
	}
	if (previous.hostId !== next.hostId) {
		const host = next.players.find((player) => player.id === next.hostId);
		if (next.hostId === userId) {
			toast.success("You’re the host now", {
				description: "You can start the game when everyone’s ready.",
			});
		} else if (host) {
			toast(`${host.name} is the host now`);
		}
	}
}

/**
 * Joins the room over HTTP (idempotent for members), then keeps a live socket
 * open. Unexpected closes rejoin and reconnect with backoff; a newer tab taking
 * over, or leaving, stops reconnection.
 */
export function useRoomConnection(code: string | null, userId: string) {
	const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
	const [connection, setConnection] = useState<ConnectionState>("connecting");
	const [blocker, setBlocker] = useState<RoomBlocker | null>(null);
	const [generation, setGeneration] = useState(0);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const socketRef = useRef<WebSocket | null>(null);
	// Set while this tab is deliberately leaving, so the socket's close is expected.
	const leavingRef = useRef(false);

	// Messages belong to one room; a different room starts with an empty chat.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the room changes
	useEffect(() => {
		setMessages([]);
	}, [code]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `generation` restarts the connection on retry
	useEffect(() => {
		if (!code) return;
		let disposed = false;
		let socket: WebSocket | null = null;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let attempt = 0;
		let previous: RoomSnapshot | null = null;

		setBlocker(null);
		setConnection("connecting");

		const applySnapshot = (next: RoomSnapshot) => {
			announceChanges(previous, next, userId);
			previous = next;
			setSnapshot(next);
		};

		const stop = (next: RoomBlocker) => {
			disposed = true;
			clearTimeout(retryTimer);
			setConnection("disconnected");
			setBlocker(next);
		};

		const scheduleRetry = (delay?: number) => {
			attempt += 1;
			if (attempt > MAX_RETRIES) {
				stop({ kind: "unreachable" });
				return;
			}
			if (attempt === 1 && previous) {
				toast.warning("Connection lost", {
					description: "Reconnecting to your room…",
				});
			}
			setConnection("reconnecting");
			retryTimer = setTimeout(connect, delay ?? retryDelay(attempt));
		};

		async function connect() {
			if (disposed) return;
			retryTimer = undefined;
			const joined = await joinRoom(code as string);
			if (disposed) return;
			if (!joined.ok) {
				if (joined.error.code === "NETWORK") {
					scheduleRetry();
				} else {
					stop({ kind: "error", error: joined.error });
				}
				return;
			}
			applySnapshot(joined.data);

			const ws = new WebSocket(roomSocketUrl(code as string));
			socket = ws;
			socketRef.current = ws;
			ws.onopen = () => {
				if (attempt > 0) toast.success("Back in the room");
				attempt = 0;
				setConnection("connected");
			};
			ws.onmessage = (message) => {
				let data: unknown;
				try {
					data = JSON.parse(String(message.data));
				} catch {
					return;
				}
				const event = serverEventsSchema.safeParse(data);
				if (!event.success) {
					// Usually a tab running older code than the server; reload to fix.
					if (process.env.NODE_ENV !== "production") {
						console.warn("Ignored unrecognized server event", data);
					}
					return;
				}
				switch (event.data.type) {
					case "room:snapshot":
						applySnapshot(event.data.snapshot);
						break;
					case "room:left":
						// Left from another tab, or this tab's own leave request.
						if (!leavingRef.current) stop({ kind: "removed" });
						else disposed = true;
						break;
					// The server's recent messages replace ours, so a reconnect
					// fills any gap without duplicating what we already had.
					case "chat:history":
						setMessages(event.data.messages);
						break;
					case "chat:message": {
						const message = event.data.message;
						setMessages((current) =>
							[...current, message].slice(-CHAT_HISTORY_LIMIT),
						);
						break;
					}
					case "error":
						toast.error(event.data.error.message);
						break;
				}
			};
			ws.onclose = (event) => {
				if (socket !== ws) return;
				socket = null;
				if (socketRef.current === ws) socketRef.current = null;
				if (disposed || leavingRef.current) return;
				if (event.code === socketCloseCodes.replaced) {
					stop({ kind: "replaced" });
					return;
				}
				scheduleRetry(
					event.code === socketCloseCodes.rateLimited ? 5_000 : undefined,
				);
			};
		}

		// Coming back online skips the rest of the backoff wait.
		const onOnline = () => {
			if (retryTimer !== undefined && !disposed) {
				clearTimeout(retryTimer);
				connect();
			}
		};

		connect();
		window.addEventListener("online", onOnline);
		return () => {
			disposed = true;
			clearTimeout(retryTimer);
			window.removeEventListener("online", onOnline);
			socket?.close(1000, "Left the page.");
			socketRef.current = null;
		};
	}, [code, userId, generation]);

	return {
		snapshot,
		connection,
		blocker,
		messages,
		/**
		 * Sends chat text; the server adds the author and time and broadcasts it
		 * back. Returns false when there is no open connection to send on.
		 */
		sendChat: (text: string) => {
			const socket = socketRef.current;
			if (socket?.readyState !== WebSocket.OPEN) return false;
			const command: ClientCommand = { type: "chat:send", text };
			socket.send(JSON.stringify(command));
			return true;
		},
		/** Starts over: rejoins and reconnects (e.g. after "Try again"). */
		retry: () => setGeneration((value) => value + 1),
		/** Marks the upcoming socket close as intentional. */
		markLeaving: (leaving: boolean) => {
			leavingRef.current = leaving;
		},
	};
}
