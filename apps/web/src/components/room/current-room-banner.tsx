"use client";

import { Button } from "@doodlesync/ui/components/button";
import { DoorOpen, LogOut } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { describeRoomError } from "@/lib/room-errors";
import { leaveRoom } from "@/lib/rooms-api";

/** Offers a way back into, or out of, the room the player still belongs to. */
export function CurrentRoomBanner({
	code,
	onLeft,
}: {
	code: string;
	onLeft: () => void;
}) {
	const [leaving, setLeaving] = useState(false);

	async function leave() {
		setLeaving(true);
		const result = await leaveRoom(code);
		setLeaving(false);
		if (!result.ok) {
			const { title, description } = describeRoomError(result.error);
			toast.error(title, { description });
			return;
		}
		toast(`You left room ${code}`);
		onLeft();
	}

	return (
		<section
			aria-label="Your current room"
			className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-ink bg-accent p-4 text-accent-foreground shadow-[0_4px_0_var(--ink)]"
		>
			<p className="font-semibold">
				You’re still in room{" "}
				<span className="font-bold font-mono tracking-widest">{code}</span>.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					render={<Link href={`/room/${code}` as Route} />}
					nativeButton={false}
				>
					<DoorOpen aria-hidden="true" /> Back to room
				</Button>
				<Button size="sm" variant="outline" disabled={leaving} onClick={leave}>
					<LogOut aria-hidden="true" /> {leaving ? "Leaving…" : "Leave it"}
				</Button>
			</div>
		</section>
	);
}
