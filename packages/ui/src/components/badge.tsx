import { cn } from "@doodlesync/ui/lib/utils";
import type { ComponentProps } from "react";

const tones = {
	neutral: "bg-muted text-foreground",
	accent: "bg-accent text-accent-foreground",
	highlight:
		"border-ink! bg-secondary text-secondary-foreground shadow-[0_2px_0_var(--ink)]",
	success: "bg-success/10 text-success",
	warning: "bg-warning/10 text-warning",
	danger: "bg-destructive/10 text-destructive",
};

function Badge({
	tone = "neutral",
	className,
	...props
}: ComponentProps<"span"> & { tone?: keyof typeof tones }) {
	return (
		<span
			data-slot="badge"
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border-2 border-current/25 px-2.5 py-0.5 font-bold text-xs [&_svg]:size-3.5",
				tones[tone],
				className,
			)}
			{...props}
		/>
	);
}

export { Badge };
