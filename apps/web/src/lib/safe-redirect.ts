import type { Route } from "next";

export const DEFAULT_SIGNED_IN_PATH = "/play" as Route;

// Only same-site paths are allowed, so `?next=` cannot send people elsewhere.
export function safeNextPath(value: string | null | undefined): Route {
	if (
		!value?.startsWith("/") ||
		value.startsWith("//") ||
		value.startsWith("/\\") ||
		value.startsWith("/login") ||
		value.startsWith("/signup")
	) {
		return DEFAULT_SIGNED_IN_PATH;
	}
	return value as Route;
}

export function withNext(path: "/login" | "/signup", next: string | null) {
	return (
		next && next !== DEFAULT_SIGNED_IN_PATH
			? `${path}?next=${encodeURIComponent(next)}`
			: path
	) as Route;
}
