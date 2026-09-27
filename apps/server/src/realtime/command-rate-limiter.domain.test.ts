import { describe, expect, it } from "vitest";
import { CommandRateLimiter } from "./command-rate-limiter";

describe("CommandRateLimiter", () => {
	it("allows ten immediate commands and keeps players independent", () => {
		const limiter = new CommandRateLimiter(() => 0);
		for (let i = 0; i < 10; i++) expect(limiter.allow("alice")).toBe(true);
		expect(limiter.allow("alice")).toBe(false);
		expect(limiter.allow("bob")).toBe(true);
	});

	it("preserves fractional refill through rejected attempts", () => {
		let now = 0;
		const limiter = new CommandRateLimiter(() => now);
		for (let i = 0; i < 10; i++) limiter.allow("alice");
		now = 250;
		expect(limiter.allow("alice")).toBe(false);
		now = 500;
		expect(limiter.allow("alice")).toBe(true);
		expect(limiter.allow("alice")).toBe(false);
		now = 1500;
		expect(limiter.allow("alice")).toBe(true);
		expect(limiter.allow("alice")).toBe(true);
		expect(limiter.allow("alice")).toBe(false);
	});

	it("caps recovered allowance at ten, including after idle cleanup", () => {
		let now = 0;
		const limiter = new CommandRateLimiter(() => now);
		limiter.allow("alice");
		for (const time of [10_000, 70_000]) {
			now = time;
			for (let i = 0; i < 10; i++) expect(limiter.allow("alice")).toBe(true);
			expect(limiter.allow("alice")).toBe(false);
		}
	});
});
