import type { PlayerSnapshot } from "@doodlesync/shared";
import { Avatar } from "@doodlesync/ui/components/avatar";
import { Badge } from "@doodlesync/ui/components/badge";
import { Crown } from "lucide-react";

export function PlayerList({
	players,
	hostId,
	currentUserId,
	maxPlayers,
}: {
	players: PlayerSnapshot[];
	hostId: string;
	currentUserId: string;
	maxPlayers: number;
}) {
	const openSeats = Math.max(0, maxPlayers - players.length);
	// Show a couple of seats as invitations; summarize the rest in one row.
	const shownSeats = Math.min(openSeats, 2);
	const hiddenSeats = openSeats - shownSeats;
	return (
		<ul aria-label="Players" className="space-y-2.5">
			{players.map((player) => (
				<li
					key={player.id}
					className="fade-in-0 slide-in-from-bottom-2 flex animate-in items-center gap-3 rounded-2xl border-2 border-border bg-card p-2 pr-3 duration-300 motion-reduce:animate-none"
				>
					<Avatar name={player.name} seed={player.id} />
					<span className="min-w-0 flex-1 truncate font-bold">
						{player.name}
					</span>
					{player.id === hostId && (
						<Badge tone="highlight">
							<Crown aria-hidden="true" /> Host
						</Badge>
					)}
					{player.id === currentUserId && <Badge tone="accent">You</Badge>}
				</li>
			))}
			{Array.from({ length: shownSeats }, (_, seat) => (
				<li
					key={`seat-${players.length + seat}`}
					className="flex items-center gap-3 rounded-2xl border-2 border-border border-dashed p-2 text-muted-foreground"
				>
					<span
						aria-hidden="true"
						className="size-11 rounded-[40%] border-2 border-border border-dashed"
					/>
					<span className="font-semibold text-sm">Open seat</span>
				</li>
			))}
			{hiddenSeats > 0 && (
				<li className="px-2 text-center font-semibold text-muted-foreground text-sm">
					+{hiddenSeats} more open {hiddenSeats === 1 ? "seat" : "seats"}
				</li>
			)}
		</ul>
	);
}
