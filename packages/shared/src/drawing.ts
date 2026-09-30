import { z } from "zod";

// Every canvas has the same shape, so a normalized point lands on the same spot
// of the drawing for every player. Width ÷ height.
export const CANVAS_ASPECT_RATIO = 4 / 3;

// Brush widths are fractions of the canvas width, so a line keeps its thickness
// relative to the drawing on any screen size.
export const BRUSH_WIDTHS = [0.005, 0.012, 0.025, 0.05] as const;
export const DRAW_MIN_WIDTH = BRUSH_WIDTHS[0];
export const DRAW_MAX_WIDTH = BRUSH_WIDTHS[3];

// Long strokes are split into several operations of at most this many points.
export const DRAW_MAX_POINTS = 256;

// 0 is the left/top edge of the canvas, 1 the right/bottom edge.
const coordinateSchema = z.number().min(0).max(1);

export const drawPointSchema = z.tuple([coordinateSchema, coordinateSchema]);

export const drawToolSchema = z.enum(["brush", "eraser"]);

export const drawColorSchema = z
	.string()
	.regex(/^#[0-9a-f]{6}$/, "Use a lowercase #rrggbb color");

export const drawStrokeSchema = z.strictObject({
	type: z.literal("stroke"),
	tool: drawToolSchema,
	color: drawColorSchema,
	width: z.number().min(DRAW_MIN_WIDTH).max(DRAW_MAX_WIDTH),
	points: z.array(drawPointSchema).min(1).max(DRAW_MAX_POINTS),
});

export const drawClearSchema = z.strictObject({
	type: z.literal("clear"),
});

export const drawOperationSchema = z.discriminatedUnion("type", [
	drawStrokeSchema,
	drawClearSchema,
]);

export type DrawPoint = z.infer<typeof drawPointSchema>;
export type DrawTool = z.infer<typeof drawToolSchema>;
export type DrawStroke = z.infer<typeof drawStrokeSchema>;
export type DrawOperation = z.infer<typeof drawOperationSchema>;
