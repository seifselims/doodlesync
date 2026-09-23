import type { ErrorCode } from "@doodlesync/shared";

export class RoomError extends Error {
	constructor(
		public readonly code: ErrorCode,
		message: string,
	) {
		super(message);
		this.name = "RoomError";
	}
}
