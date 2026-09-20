import { z } from "zod";

export const errorCodeSchema = z.enum([
      "INVALID_INPUT",
      "UNAUTHENTICATED",
      "ROOM_NOT_FOUND",
      "ROOM_FULL",
      "NOT_HOST",
      "NOT_IN_ROOM",
]);

export const errorSchema = z.strictObject({
      code: errorCodeSchema,
      message: z.string().min(1),
});

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type GameError = z.infer<typeof errorSchema>;