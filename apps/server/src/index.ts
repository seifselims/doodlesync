import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { ENV } from "./env.server";
import { startRoomCleanup } from "./rooms/room-cleanup";
import { auth, roomService } from "./services";

const app = createApp({
	corsOrigin: ENV.CORS_ORIGIN,
	authHandler: (request) => auth.handler(request),
	getSession: (headers) => auth.api.getSession({ headers }),
	roomService,
});

const server = serve(
	{
		fetch: app.fetch,
		port: 3000,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);

const stopRoomCleanup = startRoomCleanup(roomService);
const shutdown = () => {
	stopRoomCleanup();
	server.close();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.once("close", () => {
	stopRoomCleanup();
	process.removeListener("SIGINT", shutdown);
	process.removeListener("SIGTERM", shutdown);
});
