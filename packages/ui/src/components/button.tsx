import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@doodlesync/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-xl border-2 border-ink bg-clip-padding font-bold font-display text-sm tracking-[0.01em] shadow-[0_4px_0_var(--ink)] outline-none transition-[color,background-color,box-shadow,transform] duration-100 ease-out focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-[3px] active:not-aria-[haspopup]:shadow-[0_1px_0_var(--ink)] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none aria-invalid:border-destructive motion-reduce:transition-none motion-reduce:active:translate-y-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),white_12%)]",
				go: "bg-go text-go-foreground hover:bg-[color-mix(in_oklch,var(--go),white_15%)]",
				outline:
					"bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),white_20%)] aria-expanded:bg-secondary",
				ghost:
					"border-transparent shadow-none hover:bg-muted hover:text-foreground active:not-aria-[haspopup]:translate-y-0 active:not-aria-[haspopup]:scale-[0.97] active:not-aria-[haspopup]:shadow-none aria-expanded:bg-muted",
				destructive:
					"bg-destructive text-white hover:bg-[color-mix(in_oklch,var(--destructive),white_12%)] dark:text-[#2a0716]",
				link: "border-transparent text-primary underline-offset-4 shadow-none hover:underline active:not-aria-[haspopup]:translate-y-0 active:not-aria-[haspopup]:shadow-none",
			},
			size: {
				default:
					"h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				xs: "h-7 gap-1 rounded-lg px-2 text-xs shadow-[0_2px_0_var(--ink)] active:not-aria-[haspopup]:translate-y-[1px] active:not-aria-[haspopup]:shadow-[0_1px_0_var(--ink)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-9 gap-1 rounded-lg px-3 shadow-[0_3px_0_var(--ink)] active:not-aria-[haspopup]:translate-y-[2px] active:not-aria-[haspopup]:shadow-[0_1px_0_var(--ink)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-14 gap-2.5 rounded-2xl px-7 text-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-5",
				icon: "size-11",
				"icon-xs":
					"size-7 rounded-lg shadow-[0_2px_0_var(--ink)] [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-9 rounded-lg shadow-[0_3px_0_var(--ink)]",
				"icon-lg": "size-14 rounded-2xl",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
