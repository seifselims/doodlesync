import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

type AppDependencies = {
	corsOrigin: string;
	authHandler: (request: Request) => Response | Promise<Response>;
};

export function createApp({ corsOrigin, authHandler }: AppDependencies) {
	const app = new Hono();

	app.use(logger());
	app.use(
		"/*",
		cors({
			origin: corsOrigin,
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		}),
	);

	app.on(["POST", "GET"], "/api/auth/*", async (c) => authHandler(c.req.raw));

	app.get("/", (c) => {
		return c.text("OK");
	});

	return app;
}
