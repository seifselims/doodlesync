import { cn } from "@doodlesync/ui/lib/utils";

const letters = [
	["D", "text-pop-pink", "-rotate-6"],
	["o", "text-pop-sun", "rotate-3"],
	["o", "text-pop-lime", "-rotate-3"],
	["d", "text-pop-teal", "rotate-6"],
	["l", "text-pop-sky", "-rotate-2"],
	["e", "text-pop-violet", "rotate-3"],
] as const;

/** Hand-lettered wordmark: each "doodle" letter is its own sticker color. */
export function Logo({
	className,
	size = "default",
}: {
	className?: string;
	size?: "default" | "hero";
}) {
	return (
		<span
			role="img"
			aria-label="DoodleSync"
			className={cn(
				"inline-flex select-none items-baseline font-bold font-display leading-none tracking-[-0.02em]",
				size === "hero" ? "text-5xl sm:text-8xl" : "text-2xl",
				className,
			)}
		>
			{letters.map(([letter, color, tilt], index) => (
				<span
					key={index}
					aria-hidden="true"
					className={cn(
						"inline-block [-webkit-text-stroke:0.09em_var(--ink)] [paint-order:stroke_fill]",
						color,
						tilt,
					)}
				>
					{letter}
				</span>
			))}
			<span
				aria-hidden="true"
				className="ml-[0.08em] inline-block text-primary [-webkit-text-stroke:0.09em_var(--ink)] [paint-order:stroke_fill] dark:text-foreground"
			>
				Sync
			</span>
		</span>
	);
}
