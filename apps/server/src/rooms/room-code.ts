import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateRoomCode(): string {
	let code = "";

	for (let i = 0; i < CODE_LENGTH; i++) {
		const index = randomInt(ALPHABET.length);
		code += ALPHABET[index];
	}

	return code;
}
