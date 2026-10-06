import {
	BRUSH_WIDTHS,
	CANVAS_ASPECT_RATIO,
	DRAW_HISTORY_MAX_POINTS,
	DRAW_MAX_POINTS,
	type DrawPoint,
	type DrawStroke,
	type DrawTool,
} from "@doodlesync/shared";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { RoomDrawing } from "@/app/(app)/room/[code]/use-room-connection";
import { drawSegment, drawStroke, replay } from "@/lib/draw-render";

import { DRAW_COLORS, DrawingToolbar } from "./drawing-toolbar";

// Four decimals is sub-pixel precision on any realistic canvas and keeps
// operations small once they are sent over the network.
function round(value: number) {
	return Math.round(Math.min(Math.max(value, 0), 1) * 10_000) / 10_000;
}

// While the pen moves, the stroke so far is sent this often so others see it
// appear live. Each part starts where the previous one ended.
const SEND_INTERVAL_MS = 80;

function pointCount(drawing: RoomDrawing) {
	let total = 0;
	for (const operation of drawing.getOperations()) {
		if (operation.type === "stroke") total += operation.points.length;
	}
	return total;
}

export function DrawingCanvas({
	drawing,
	canDraw,
}: {
	drawing: RoomDrawing;
	/** Only the host draws for now; everyone else watches. */
	canDraw: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	// The drawing lives as data in `drawing`; the canvas pixels only render it.
	const currentRef = useRef<{
		pointerId: number;
		stroke: DrawStroke;
		sentAt: number;
	} | null>(null);
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
			replay(context, drawing.getOperations(), width, height);
			const current = currentRef.current;
			if (current) drawStroke(context, current.stroke, width, height);
		});
		observer.observe(canvas);
		// Other players' operations, and full replacements (history or clear).
		const unsubscribe = drawing.subscribe((change) => {
			const { width, height } = canvas.getBoundingClientRect();
			if (change.kind === "operation") {
				if (change.operation.type === "stroke") {
					drawStroke(context, change.operation, width, height);
				}
			} else {
				replay(context, drawing.getOperations(), width, height);
			}
			setCanClear(drawing.getOperations().length > 0);
		});
		setCanClear(drawing.getOperations().length > 0);
		return () => {
			observer.disconnect();
			unsubscribe();
		};
	}, [drawing]);

	// Losing drawing rights (e.g. host moved) ends any stroke in progress.
	useEffect(() => {
		if (!canDraw) currentRef.current = null;
	}, [canDraw]);

	function toPoint(
		event: { clientX: number; clientY: number },
		rect: DOMRect,
	): DrawPoint {
		return [
			round((event.clientX - rect.left) / rect.width),
			round((event.clientY - rect.top) / rect.height),
		];
	}

	// Removes a stroke the server would not accept from this screen too.
	function redraw() {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		const { width, height } = canvas.getBoundingClientRect();
		replay(context, drawing.getOperations(), width, height);
	}

	// Sends the stroke so far. Returns false (and ends the stroke) on failure.
	function sendStroke(): boolean {
		const current = currentRef.current;
		if (!current) return false;
		if (
			pointCount(drawing) + current.stroke.points.length >
			DRAW_HISTORY_MAX_POINTS
		) {
			currentRef.current = null;
			redraw();
			toast.error("The canvas is full", {
				description: "Clear it to keep drawing.",
			});
			return false;
		}
		if (!drawing.send(current.stroke)) {
			currentRef.current = null;
			redraw();
			toast.error("Not connected", { description: "Your stroke wasn’t sent." });
			return false;
		}
		setCanClear(true);
		return true;
	}

	function finishStroke() {
		sendStroke();
		currentRef.current = null;
	}

	// Sends the stroke so far and keeps drawing from its last point.
	function sendAndContinue(pointerId: number, now: number) {
		const stroke = currentRef.current?.stroke;
		if (!stroke || !sendStroke()) return;
		const last = stroke.points[stroke.points.length - 1] as DrawPoint;
		currentRef.current = {
			pointerId,
			stroke: { ...stroke, points: [last] },
			sentAt: now,
		};
	}

	function clear() {
		if (!drawing.send({ type: "clear" })) {
			toast.error("Not connected", {
				description: "The canvas wasn’t cleared.",
			});
			return;
		}
		currentRef.current = null;
		redraw();
		setCanClear(false);
	}

	function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
		// Primary button, finger or pen only; ignore a second finger mid-stroke.
		if (!canDraw || event.button !== 0 || currentRef.current) return;
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
		currentRef.current = {
			pointerId: event.pointerId,
			stroke,
			sentAt: performance.now(),
		};
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
				sendAndContinue(event.pointerId, performance.now());
			}
		}
		const now = performance.now();
		const latest = currentRef.current;
		if (
			latest &&
			latest.stroke.points.length > 1 &&
			now - latest.sentAt >= SEND_INTERVAL_MS
		) {
			sendAndContinue(event.pointerId, now);
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
					className={
						canDraw
							? "block size-full cursor-crosshair touch-none"
							: "block size-full"
					}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerEnd}
					onPointerCancel={onPointerEnd}
				/>
			</div>
			{canDraw && (
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
			)}
		</div>
	);
}
