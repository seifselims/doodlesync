import { createAuth } from "@doodlesync/auth";
import { createDb } from "@doodlesync/db";

import { ENV } from "./env.server";
import { ConnectionRegistry } from "./realtime/connection-registry";
import { RoomService } from "./rooms/room-service";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
export const roomService = new RoomService();
export const connections = new ConnectionRegistry();
