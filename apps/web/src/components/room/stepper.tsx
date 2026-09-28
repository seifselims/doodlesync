"use client";

import { Button } from "@doodlesync/ui/components/button";
import { Minus, Plus } from "lucide-react";

/** Compact numeric control with large tap targets and a live value. */
export function Stepper({
	id,
	label,
	value,
	min,
	max,
	step = 1,
	format = String,
	onChange,
}: {
	id: string;
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	format?: (value: number) => string;
	onChange: (value: number) => void;
}) {
	return (
		<fieldset className="flex items-center justify-between gap-3">
			<legend className="sr-only">{label}</legend>
			<span aria-hidden="true" className="font-bold text-sm">
				{label}
			</span>
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					aria-label={`Decrease ${label.toLowerCase()}`}
					disabled={value <= min}
					onClick={() => onChange(Math.max(min, value - step))}
				>
					<Minus aria-hidden="true" />
				</Button>
				<output
					id={id}
					aria-live="polite"
					className="min-w-16 text-center font-bold font-display text-lg tabular-nums"
				>
					{format(value)}
				</output>
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					aria-label={`Increase ${label.toLowerCase()}`}
					disabled={value >= max}
					onClick={() => onChange(Math.min(max, value + step))}
				>
					<Plus aria-hidden="true" />
				</Button>
			</div>
		</fieldset>
	);
}
