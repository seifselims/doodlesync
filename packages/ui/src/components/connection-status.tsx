import { Badge } from "@doodlesync/ui/components/badge";
import type { ComponentProps } from "react";

const states = {
	connected: { label: "Connected", tone: "success", pulse: false },
	connecting: { label: "Connecting…", tone: "warning", pulse: true },
	reconnecting: { label: "Reconnecting…", tone: "warning", pulse: true },
	disconnected: { label: "Disconnected", tone: "danger", pulse: false },
} as const;

function ConnectionStatus({
	status,
	...props
}: Omit<ComponentProps<"span">, "children"> & { status: keyof typeof states }) {
	const state = states[status];
	return (
		<Badge
			role="status"
			aria-live="polite"
			aria-atomic="true"
			tone={state.tone}
			{...props}
		>
			<span aria-hidden="true" className="relative flex size-2">
				{state.pulse && (
					<span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
				)}
				<span className="relative size-2 rounded-full bg-current" />
			</span>
			{state.label}
		</Badge>
	);
}

export { ConnectionStatus };
