import { socketCloseCodes } from "@doodlesync/shared";
import { describe, expect, it, vi } from "vitest";
import { ConnectionRegistry } from "./connection-registry";

const socket = () => ({ close: vi.fn() });

describe("ConnectionRegistry", () => {
	it("tracks a player's connection until it closes", () => {
		const registry = new ConnectionRegistry();
		const first = socket();
		registry.attach("user-1", "ABC234", first);
		expect(registry.get("user-1")).toEqual({
			roomCode: "ABC234",
			socket: first,
		});
		expect(registry.detach("user-1", first)).toBe(true);
		expect(registry.get("user-1")).toBeUndefined();
	});

	it("replaces an older connection with the newest one", () => {
		const registry = new ConnectionRegistry();
		const first = socket();
		const second = socket();
		registry.attach("user-1", "ABC234", first);
		registry.attach("user-1", "ABC234", second);
		expect(first.close).toHaveBeenCalledWith(
			socketCloseCodes.replaced,
			expect.any(String),
		);
		expect(second.close).not.toHaveBeenCalled();
		expect(registry.get("user-1")?.socket).toBe(second);
	});

	it("ignores a replaced connection's late close", () => {
		const registry = new ConnectionRegistry();
		const first = socket();
		const second = socket();
		registry.attach("user-1", "ABC234", first);
		registry.attach("user-1", "ABC234", second);
		expect(registry.detach("user-1", first)).toBe(false);
		expect(registry.get("user-1")?.socket).toBe(second);
	});

	it("keeps players independent and treats reattaching the same socket as a no-op", () => {
		const registry = new ConnectionRegistry();
		const mine = socket();
		const theirs = socket();
		registry.attach("user-1", "ABC234", mine);
		registry.attach("user-2", "ABC234", theirs);
		registry.attach("user-1", "ABC234", mine);
		expect(mine.close).not.toHaveBeenCalled();
		expect(theirs.close).not.toHaveBeenCalled();
		expect(registry.detach("user-2", mine)).toBe(false);
		expect(registry.get("user-2")?.socket).toBe(theirs);
	});
});
