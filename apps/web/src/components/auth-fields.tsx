"use client";

import { Button } from "@doodlesync/ui/components/button";
import { Input } from "@doodlesync/ui/components/input";
import { Label } from "@doodlesync/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type FieldProps = {
	id: string;
	label: string;
	value: string;
	errors: string[];
	hint?: string;
	onChange: (value: string) => void;
	onBlur: () => void;
} & Pick<
	React.ComponentProps<"input">,
	"type" | "autoComplete" | "placeholder" | "maxLength" | "autoFocus"
>;

/** Labelled input with an associated hint or error message. */
export function AuthField({
	id,
	label,
	value,
	errors,
	hint,
	onChange,
	onBlur,
	type = "text",
	...inputProps
}: FieldProps) {
	const [revealed, setRevealed] = useState(false);
	const isPassword = type === "password";
	const messageId = `${id}-message`;
	const error = errors[0];
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<div className="relative">
				<Input
					id={id}
					name={id}
					type={isPassword && revealed ? "text" : type}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					onBlur={onBlur}
					aria-invalid={error ? true : undefined}
					aria-describedby={error || hint ? messageId : undefined}
					className={isPassword ? "pr-12" : undefined}
					{...inputProps}
				/>
				{isPassword && (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="absolute top-1/2 right-1.5 -translate-y-1/2 active:not-aria-[haspopup]:-translate-y-1/2"
						aria-label={revealed ? "Hide password" : "Show password"}
						aria-pressed={revealed}
						onClick={() => setRevealed(!revealed)}
					>
						{revealed ? (
							<EyeOff aria-hidden="true" />
						) : (
							<Eye aria-hidden="true" />
						)}
					</Button>
				)}
			</div>
			{(error || hint) && (
				<p
					id={messageId}
					className={
						error
							? "font-semibold text-destructive text-sm"
							: "text-muted-foreground text-sm"
					}
				>
					{error ?? hint}
				</p>
			)}
		</div>
	);
}

/**
 * Visible messages for a TanStack field: after the player typed in it, or after
 * a submit attempt. Merely focusing and leaving an empty field shows nothing, so
 * the layout does not jump while someone clicks a nearby link.
 */
export function fieldErrors(
	meta: {
		isDirty: boolean;
		errors: ({ message?: string } | string | undefined)[];
	},
	submitted: boolean,
) {
	if (!meta.isDirty && !submitted) return [];
	return meta.errors
		.map((error) => (typeof error === "string" ? error : error?.message))
		.filter((message): message is string => Boolean(message));
}
