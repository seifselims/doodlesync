import type { RoomApiError } from "./rooms-api";

// Player-facing copy for each stable server error code.
export function describeRoomError(error: RoomApiError): {
	title: string;
	description: string;
} {
	switch (error.code) {
		case "ROOM_NOT_FOUND":
			return {
				title: "We couldn’t find that room",
				description:
					"Check the code with your host. Empty rooms close after a minute.",
			};
		case "ROOM_FULL":
			return {
				title: "That room is full",
				description:
					"Every seat is taken. Ask the host to make space, or start your own room.",
			};
		case "ALREADY_IN_ROOM":
			return {
				title: "You’re already in another room",
				description: "You can only be in one room at a time.",
			};
		case "INVALID_INPUT":
			return {
				title: "That doesn’t look right",
				description: error.message,
			};
		case "UNAUTHENTICATED":
			return {
				title: "Your session ended",
				description: "Sign in again to keep playing.",
			};
		case "ROOM_CODE_EXHAUSTED":
			return {
				title: "Couldn’t make a room right now",
				description: "The server is busy. Try again in a moment.",
			};
		case "NETWORK":
			return {
				title: "Can’t reach the game server",
				description: "Check your connection, then try again.",
			};
		default:
			return { title: "Something went wrong", description: error.message };
	}
}
