import type { DrawOperation, DrawPoint, DrawStroke } from "@doodlesync/shared";

// Turns normalized drawing operations into pixels. `width` and `height` are the
// canvas size in CSS pixels; the context is already scaled for the device.

function applyStyle(
	context: CanvasRenderingContext2D,
	stroke: DrawStroke,
	width: number,
) {
	context.globalCompositeOperation =
		stroke.tool === "eraser" ? "destination-out" : "source-over";
	context.strokeStyle = stroke.color;
	context.fillStyle = stroke.color;
	context.lineWidth = stroke.width * width;
	context.lineCap = "round";
	context.lineJoin = "round";
}

// Draws the line from `from` to `to`, or a dot when the stroke is a single tap.
export function drawSegment(
	context: CanvasRenderingContext2D,
	stroke: DrawStroke,
	from: DrawPoint,
	to: DrawPoint,
	width: number,
	height: number,
) {
	applyStyle(context, stroke, width);
	if (from[0] === to[0] && from[1] === to[1]) {
		context.beginPath();
		context.arc(
			from[0] * width,
			from[1] * height,
			context.lineWidth / 2,
			0,
			Math.PI * 2,
		);
		context.fill();
		return;
	}
	context.beginPath();
	context.moveTo(from[0] * width, from[1] * height);
	context.lineTo(to[0] * width, to[1] * height);
	context.stroke();
}

export function drawStroke(
	context: CanvasRenderingContext2D,
	stroke: DrawStroke,
	width: number,
	height: number,
) {
	const [first, ...rest] = stroke.points;
	if (!first) return;
	if (rest.length === 0) {
		drawSegment(context, stroke, first, first, width, height);
		return;
	}
	applyStyle(context, stroke, width);
	context.beginPath();
	context.moveTo(first[0] * width, first[1] * height);
	for (const [x, y] of rest) context.lineTo(x * width, y * height);
	context.stroke();
}

// Rebuilds the picture from scratch, e.g. after the canvas changes size.
export function replay(
	context: CanvasRenderingContext2D,
	operations: readonly DrawOperation[],
	width: number,
	height: number,
) {
	context.clearRect(0, 0, width, height);
	for (const operation of operations) {
		if (operation.type === "clear") context.clearRect(0, 0, width, height);
		else drawStroke(context, operation, width, height);
	}
}
