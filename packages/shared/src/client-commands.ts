import { z } from "zod";
import { roomSettingsSchema } from "./room-settings";

export const clientCommandSchema = z.discriminatedUnion("type", [
      z.strictObject({
              type: z.literal("room:join"),
              code: z.string().trim().min(1),
      }),
      z.strictObject({
              type: z.literal("room:leave"),
      }),
      z.strictObject({
              type: z.literal("room:update-settings"),
              settings: roomSettingsSchema,
      }),
]);

export type ClientCommand = z.infer<typeof clientCommandSchema>;