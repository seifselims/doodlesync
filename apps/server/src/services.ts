import { createAuth } from "@doodlesync/auth";
import { createDb } from "@doodlesync/db";

import { ENV } from "./env.server";
import { RoomService } from "./rooms/room-service";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
export const roomService = new RoomService();
