import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { ENV } from "./env.server";
import { auth } from "./services";

const app = createApp({
	corsOrigin: ENV.CORS_ORIGIN,
	authHandler: (request) => auth.handler(request),
});

serve(
	{
		fetch: app.fetch,
		port: 3000,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);
