import { Loader2 } from "lucide-react";

export default function Loader({ label = "Loading…" }: { label?: string }) {
	return (
		<div
			role="status"
			className="flex h-full min-h-60 flex-col items-center justify-center gap-3 font-display font-semibold text-muted-foreground"
		>
			<Loader2
				aria-hidden="true"
				className="size-7 animate-spin text-primary motion-reduce:animate-none"
			/>
			{label}
		</div>
	);
}
