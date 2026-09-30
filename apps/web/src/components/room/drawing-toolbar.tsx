import { BRUSH_WIDTHS, type DrawTool } from "@doodlesync/shared";
import { Button } from "@doodlesync/ui/components/button";
import { Eraser, Paintbrush, Trash2 } from "lucide-react";

// Paint colors are part of the picture, not the UI theme, so they are the same
// hex values for every player in light and dark mode.
export const DRAW_COLORS = [
	{ name: "Ink", value: "#1b1f3b" },
	{ name: "Gray", value: "#8a8fa3" },
	{ name: "White", value: "#ffffff" },
	{ name: "Red", value: "#e5484d" },
	{ name: "Orange", value: "#f76b15" },
	{ name: "Yellow", value: "#ffc53d" },
	{ name: "Green", value: "#46a758" },
	{ name: "Blue", value: "#0090ff" },
	{ name: "Purple", value: "#8e4ec6" },
	{ name: "Pink", value: "#d6409f" },
	{ name: "Brown", value: "#8d5a3b" },
] as const;

const WIDTH_NAMES = ["Small", "Medium", "Large", "Huge"];

// Selected toggles get the soft "accent" fill used for emphasis elsewhere.
const pressedClass =
	"aria-pressed:bg-accent aria-pressed:text-accent-foreground";

export function DrawingToolbar({
	tool,
	color,
	width,
	canClear,
	onToolChange,
	onColorChange,
	onWidthChange,
	onClear,
}: {
	tool: DrawTool;
	color: string;
	width: number;
	canClear: boolean;
	onToolChange: (tool: DrawTool) => void;
	onColorChange: (color: string) => void;
	onWidthChange: (width: number) => void;
	onClear: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
			<fieldset className="flex flex-wrap gap-1.5">
				<legend className="sr-only">Color</legend>
				{DRAW_COLORS.map((option) => (
					<button
						key={option.value}
						type="button"
						aria-label={option.name}
						aria-pressed={tool === "brush" && color === option.value}
						onClick={() => {
							onColorChange(option.value);
							onToolChange("brush");
						}}
						className="size-8 rounded-full border-2 border-ink shadow-[0_2px_0_var(--ink)] outline-none transition-transform duration-100 ease-out focus-visible:ring-3 focus-visible:ring-ring/60 active:translate-y-px aria-pressed:scale-110 aria-pressed:ring-3 aria-pressed:ring-primary motion-reduce:transition-none motion-reduce:active:translate-y-0"
						style={{ backgroundColor: option.value }}
					/>
				))}
			</fieldset>

			<fieldset className="flex gap-1.5">
				<legend className="sr-only">Brush size</legend>
				{BRUSH_WIDTHS.map((option, index) => (
					<Button
						key={option}
						size="icon-sm"
						variant="outline"
						className={pressedClass}
						aria-pressed={width === option}
						onClick={() => onWidthChange(option)}
					>
						{/* The dot grows with the brush so the sizes compare at a glance. */}
						<span
							aria-hidden="true"
							className="rounded-full bg-current"
							style={{ width: 4 + index * 5, height: 4 + index * 5 }}
						/>
						<span className="sr-only">{WIDTH_NAMES[index]} brush</span>
					</Button>
				))}
			</fieldset>

			<fieldset className="flex gap-1.5">
				<legend className="sr-only">Tool</legend>
				<Button
					size="icon-sm"
					variant="outline"
					className={pressedClass}
					aria-pressed={tool === "brush"}
					onClick={() => onToolChange("brush")}
				>
					<Paintbrush aria-hidden="true" />
					<span className="sr-only">Brush</span>
				</Button>
				<Button
					size="icon-sm"
					variant="outline"
					className={pressedClass}
					aria-pressed={tool === "eraser"}
					onClick={() => onToolChange("eraser")}
				>
					<Eraser aria-hidden="true" />
					<span className="sr-only">Eraser</span>
				</Button>
			</fieldset>

			<Button
				size="sm"
				variant="outline"
				className="sm:ml-auto"
				disabled={!canClear}
				onClick={onClear}
			>
				<Trash2 aria-hidden="true" /> Clear
			</Button>
		</div>
	);
}
