import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";

import { createApp } from "./app";
import { ENV } from "./env.server";
import { startRoomCleanup } from "./rooms/room-cleanup";
import { auth, connections, roomService } from "./services";

const app = createApp({
	corsOrigin: ENV.CORS_ORIGIN,
	authHandler: (request) => auth.handler(request),
	getSession: (headers) => auth.api.getSession({ headers }),
	roomService,
	connections,
});

// Shares the HTTP server; Hono routes decide which requests may upgrade.
const webSocketServer = new WebSocketServer({
	noServer: true,
	maxPayload: 16 * 1024,
});

const server = serve(
	{
		fetch: app.fetch,
		port: 3000,
		websocket: { server: webSocketServer },
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);

const stopRoomCleanup = startRoomCleanup(roomService);
const shutdown = () => {
	stopRoomCleanup();
	webSocketServer.close();
	server.close();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.once("close", () => {
	stopRoomCleanup();
	process.removeListener("SIGINT", shutdown);
	process.removeListener("SIGTERM", shutdown);
});
