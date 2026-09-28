import { cn } from "@doodlesync/ui/lib/utils";
import type { ComponentProps } from "react";

// Ink text stays readable on every pop color in both themes.
const colors = [
	"bg-pop-pink",
	"bg-pop-violet",
	"bg-pop-sky",
	"bg-pop-teal",
	"bg-pop-lime",
	"bg-pop-sun",
];

function colorFor(seed: string) {
	let hash = 0;
	for (const char of seed) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
	}
	return colors[hash % colors.length];
}

function Avatar({
	name,
	seed,
	className,
	...props
}: Omit<ComponentProps<"span">, "children"> & {
	name: string;
	/** Stable value, such as a player id, that picks the avatar color. */
	seed?: string;
}) {
	const initials =
		name
			.trim()
			.split(/\s+/u)
			.slice(0, 2)
			.map((part) => Array.from(part)[0])
			.join("")
			.toLocaleUpperCase() || "?";
	return (
		<span
			role="img"
			aria-label={name || "Player"}
			data-slot="avatar"
			className={cn(
				"inline-flex size-11 shrink-0 items-center justify-center rounded-[40%] border-2 border-ink font-display font-semibold text-[#1b1f3b] text-base shadow-[0_3px_0_var(--ink)]",
				colorFor(seed ?? name),
				className,
			)}
			{...props}
		>
			{initials}
		</span>
	);
}

export { Avatar };
