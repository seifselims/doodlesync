import {
	BRUSH_WIDTHS,
	CANVAS_ASPECT_RATIO,
	DRAW_MAX_POINTS,
	type DrawOperation,
	type DrawPoint,
	type DrawStroke,
	type DrawTool,
} from "@doodlesync/shared";
import { useEffect, useRef, useState } from "react";

import { drawSegment, drawStroke, replay } from "@/lib/draw-render";

import { DRAW_COLORS, DrawingToolbar } from "./drawing-toolbar";

// Four decimals is sub-pixel precision on any realistic canvas and keeps
// operations small once they are sent over the network.
function round(value: number) {
	return Math.round(Math.min(Math.max(value, 0), 1) * 10_000) / 10_000;
}

export function DrawingCanvas() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	// The drawing lives as data; the canvas pixels are only a rendering of it.
	const operationsRef = useRef<DrawOperation[]>([]);
	const currentRef = useRef<{ pointerId: number; stroke: DrawStroke } | null>(
		null,
	);
	const [tool, setTool] = useState<DrawTool>("brush");
	const [color, setColor] = useState<string>(DRAW_COLORS[0].value);
	const [width, setWidth] = useState<number>(BRUSH_WIDTHS[1]);
	const [canClear, setCanClear] = useState(false);

	// Match the canvas's pixel buffer to its on-screen size and redraw.
	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		const observer = new ResizeObserver(() => {
			const { width, height } = canvas.getBoundingClientRect();
			const scale = window.devicePixelRatio || 1;
			canvas.width = Math.round(width * scale);
			canvas.height = Math.round(height * scale);
			context.setTransform(scale, 0, 0, scale, 0, 0);
			replay(context, operationsRef.current, width, height);
			const current = currentRef.current;
			if (current) drawStroke(context, current.stroke, width, height);
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	function toPoint(
		event: { clientX: number; clientY: number },
		rect: DOMRect,
	): DrawPoint {
		return [
			round((event.clientX - rect.left) / rect.width),
			round((event.clientY - rect.top) / rect.height),
		];
	}

	function finishStroke() {
		const current = currentRef.current;
		if (!current) return;
		operationsRef.current.push(current.stroke);
		currentRef.current = null;
		setCanClear(true);
	}

	function clear() {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		// Nothing before a clear is visible afterwards, so the history can go too.
		operationsRef.current = [];
		currentRef.current = null;
		const { width, height } = canvas.getBoundingClientRect();
		context.clearRect(0, 0, width, height);
		setCanClear(false);
	}

	function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
		// Primary button, finger or pen only; ignore a second finger mid-stroke.
		if (event.button !== 0 || currentRef.current) return;
		const canvas = event.currentTarget;
		const context = canvas.getContext("2d");
		if (!context) return;
		canvas.setPointerCapture(event.pointerId);
		const rect = canvas.getBoundingClientRect();
		const point = toPoint(event, rect);
		const stroke: DrawStroke = {
			type: "stroke",
			tool,
			color,
			width,
			points: [point],
		};
		currentRef.current = { pointerId: event.pointerId, stroke };
		drawSegment(context, stroke, point, point, rect.width, rect.height);
	}

	function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
		const current = currentRef.current;
		if (!current || current.pointerId !== event.pointerId) return;
		const canvas = event.currentTarget;
		const context = canvas.getContext("2d");
		if (!context) return;
		const rect = canvas.getBoundingClientRect();
		// Browsers merge fast movements into one event; the merged points keep curves smooth.
		const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
		for (const sample of samples.length > 0 ? samples : [event]) {
			const stroke = currentRef.current?.stroke;
			if (!stroke) return;
			const last = stroke.points[stroke.points.length - 1];
			const point = toPoint(sample, rect);
			if (!last || (last[0] === point[0] && last[1] === point[1])) continue;
			drawSegment(context, stroke, last, point, rect.width, rect.height);
			stroke.points.push(point);
			// Split long strokes; the next part starts where this one ended.
			if (stroke.points.length === DRAW_MAX_POINTS) {
				finishStroke();
				currentRef.current = {
					pointerId: event.pointerId,
					stroke: { ...stroke, points: [point] },
				};
			}
		}
	}

	function onPointerEnd(event: React.PointerEvent<HTMLCanvasElement>) {
		if (currentRef.current?.pointerId === event.pointerId) finishStroke();
	}

	return (
		<div className="space-y-3">
			<div
				className="w-full overflow-hidden rounded-xl border-2 border-ink bg-white"
				style={{ aspectRatio: CANVAS_ASPECT_RATIO }}
			>
				{/* The canvas stays white paper in dark mode so every player sees the same picture. */}
				<canvas
					ref={canvasRef}
					aria-label="Drawing canvas"
					className="block size-full cursor-crosshair touch-none"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerEnd}
					onPointerCancel={onPointerEnd}
				/>
			</div>
			<DrawingToolbar
				tool={tool}
				color={color}
				width={width}
				canClear={canClear}
				onToolChange={setTool}
				onColorChange={setColor}
				onWidthChange={setWidth}
				onClear={clear}
			/>
		</div>
	);
}
