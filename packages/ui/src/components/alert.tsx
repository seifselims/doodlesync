import { cn } from "@doodlesync/ui/lib/utils";
import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

function Alert({
	title,
	children,
	action,
	className,
	...props
}: Omit<ComponentProps<"div">, "title"> & {
	title: string;
	action?: ReactNode;
}) {
	return (
		<div
			role="alert"
			data-slot="alert"
			className={cn(
				"flex items-start gap-3 rounded-2xl border-2 border-destructive bg-destructive/8 p-4 text-sm",
				className,
			)}
			{...props}
		>
			<CircleAlert
				aria-hidden="true"
				className="mt-0.5 size-5 shrink-0 text-destructive"
			/>
			<div className="min-w-0 flex-1 space-y-2">
				<p className="font-display font-semibold text-base text-destructive">
					{title}
				</p>
				<div className="text-foreground leading-relaxed">{children}</div>
				{action && <div className="pt-1">{action}</div>}
			</div>
		</div>
	);
}

export { Alert };
