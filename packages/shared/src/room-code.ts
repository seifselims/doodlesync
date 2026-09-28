import { z } from "zod";

// Six characters from the server's unambiguous alphabet, normalized to uppercase.
export const roomCodeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z2-9]{6}$/);
