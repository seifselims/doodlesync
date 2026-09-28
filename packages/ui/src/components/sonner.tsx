"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	// Shares the theme (tokens, sticker outline) via `.toaster` rules in globals.css.
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			position="top-center"
			richColors
			closeButton
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--ink)",
					"--success-bg":
						"color-mix(in oklch, var(--success) 12%, var(--popover))",
					"--success-text": "var(--success)",
					"--success-border": "var(--ink)",
					"--error-bg":
						"color-mix(in oklch, var(--destructive) 12%, var(--popover))",
					"--error-text": "var(--destructive)",
					"--error-border": "var(--ink)",
					"--warning-bg":
						"color-mix(in oklch, var(--secondary) 35%, var(--popover))",
					"--warning-text": "var(--popover-foreground)",
					"--warning-border": "var(--ink)",
					"--info-bg":
						"color-mix(in oklch, var(--primary) 12%, var(--popover))",
					"--info-text": "var(--popover-foreground)",
					"--info-border": "var(--ink)",
					"--border-radius": "calc(var(--radius) + 2px)",
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
