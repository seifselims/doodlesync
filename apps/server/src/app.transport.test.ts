import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const corsOrigin = "http://localhost:3001";

function setup() {
	const authHandler = vi.fn(async (_request: Request) => {
		return new Response("unauthenticated", {
			status: 401,
			headers: { "Set-Cookie": "session=; Max-Age=0; HttpOnly" },
		});
	});
	return { app: createApp({ corsOrigin, authHandler }), authHandler };
}

describe("HTTP application", () => {
	it("serves the root without invoking authentication", async () => {
		const { app, authHandler } = setup();
		const response = await app.request("/");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
		expect(authHandler).not.toHaveBeenCalled();
	});

	it.each(["GET", "POST"])(
		"forwards %s auth requests and preserves auth responses",
		async (method) => {
			const { app, authHandler } = setup();
			const request = new Request("http://localhost/api/auth/get-session", {
				method,
				headers: { Cookie: "session=test-session" },
				...(method === "POST" ? { body: "test-body" } : {}),
			});
			const response = await app.request(request);
			expect(authHandler).toHaveBeenCalledExactlyOnceWith(request);
			expect(response.status).toBe(401);
			expect(await response.text()).toBe("unauthenticated");
			expect(response.headers.get("Set-Cookie")).toBe(
				"session=; Max-Age=0; HttpOnly",
			);
			if (method === "POST") {
				expect(await request.text()).toBe("test-body");
			}
		},
	);

	it("does not forward unsupported auth methods", async () => {
		const { app, authHandler } = setup();
		const response = await app.request("/api/auth/get-session", {
			method: "DELETE",
		});
		expect(response.status).toBe(404);
		expect(authHandler).not.toHaveBeenCalled();
	});

	it("allows credentialed requests from the configured frontend", async () => {
		const { app } = setup();
		const response = await app.request("/", {
			headers: { Origin: corsOrigin },
		});
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			corsOrigin,
		);
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
			"true",
		);
	});

	it("does not grant a different origin CORS access", async () => {
		const { app } = setup();
		const response = await app.request("/", {
			headers: { Origin: "https://untrusted.example" },
		});
		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});

	it("handles preflight without invoking authentication", async () => {
		const { app, authHandler } = setup();
		const response = await app.request("/api/auth/sign-in/email", {
			method: "OPTIONS",
			headers: {
				Origin: corsOrigin,
				"Access-Control-Request-Method": "POST",
				"Access-Control-Request-Headers": "Content-Type,Authorization",
			},
		});
		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			corsOrigin,
		);
		expect(
			response.headers.get("Access-Control-Allow-Methods")?.split(","),
		).toEqual(["GET", "POST", "OPTIONS"]);
		expect(
			response.headers.get("Access-Control-Allow-Headers")?.split(","),
		).toEqual(["Content-Type", "Authorization"]);
		expect(authHandler).not.toHaveBeenCalled();
	});
});
