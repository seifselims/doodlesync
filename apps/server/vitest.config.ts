import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "domain",
					environment: "node",
					include: ["src/**/*.domain.test.ts"],
				},
			},
			{
				test: {
					name: "transport",
					environment: "node",
					include: ["src/**/*.transport.test.ts"],
				},
			},
		],
	},
});
