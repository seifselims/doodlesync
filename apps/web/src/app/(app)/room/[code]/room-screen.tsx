"use client";

import { roomCodeSchema } from "@doodlesync/shared";
import { Alert } from "@doodlesync/ui/components/alert";
import { Button } from "@doodlesync/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@doodlesync/ui/components/card";
import { ConnectionStatus } from "@doodlesync/ui/components/connection-status";
import { Clock, LogOut, Play, Repeat, Users } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useSignedInUser } from "@/components/auth-guard";
import Loader from "@/components/loader";
import { PlayerList } from "@/components/room/player-list";
import { RoomCodePanel } from "@/components/room/room-code-panel";
import { describeRoomError } from "@/lib/room-errors";
import { getCurrentRoomCode, leaveRoom } from "@/lib/rooms-api";

import { type RoomBlocker, useRoomConnection } from "./use-room-connection";

export function RoomScreen({ rawCode }: { rawCode: string }) {
	const router = useRouter();
	const user = useSignedInUser();
	const parsed = roomCodeSchema.safeParse(rawCode);
	const code = parsed.success ? parsed.data : null;
	const { snapshot, connection, blocker, retry, markLeaving } =
		useRoomConnection(code, user.id);
	const [leaving, setLeaving] = useState(false);

	// Keep one canonical URL per room (invite links may be typed in lowercase).
	useEffect(() => {
		if (code && rawCode !== code) router.replace(`/room/${code}` as Route);
	}, [code, rawCode, router]);

	// An expired session sends the player to sign in and back here afterwards.
	const sessionExpired =
		blocker?.kind === "error" && blocker.error.code === "UNAUTHENTICATED";
	useEffect(() => {
		if (sessionExpired && code) {
			router.replace(
				`/login?next=${encodeURIComponent(`/room/${code}`)}` as Route,
			);
		}
	}, [sessionExpired, code, router]);

	async function leave() {
		if (!code) return;
		setLeaving(true);
		markLeaving(true);
		const result = await leaveRoom(code);
		if (!result.ok) {
			markLeaving(false);
			setLeaving(false);
			const { title, description } = describeRoomError(result.error);
			toast.error(title, {
				description,
				action: { label: "Try again", onClick: leave },
			});
			return;
		}
		toast(`You left room ${code}`);
		router.replace("/play" as Route);
	}

	if (!code) {
		return (
			<RoomProblem
				title="That isn’t a room code"
				description="Room codes are six characters, like K7PQ2A. Check the link your friend sent."
				actions={<BackToPlay label="Enter a code" />}
			/>
		);
	}

	if (blocker) {
		return (
			<BlockerView
				blocker={blocker}
				code={code}
				onRetry={retry}
				onRedirecting={sessionExpired}
			/>
		);
	}

	if (!snapshot) {
		return <Loader label={`Joining room ${code}…`} />;
	}

	const isHost = snapshot.hostId === user.id;
	const host = snapshot.players.find((player) => player.id === snapshot.hostId);
	const { maxPlayers, rounds, drawTimeSeconds } = snapshot.settings;

	return (
		<main className="px-4 pt-8 pb-20 sm:pt-12">
			<div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[1fr_1.3fr] lg:grid-rows-[auto_1fr]">
				<div className="space-y-6 lg:col-start-1 lg:row-start-1">
					<header className="space-y-1">
						<p className="font-bold text-muted-foreground text-sm uppercase tracking-[0.12em]">
							Lobby
						</p>
						<h1 className="font-display font-semibold text-4xl leading-[1.05] tracking-[-0.02em]">
							{isHost ? "Your room" : `${host?.name ?? "The host"}’s room`}
						</h1>
					</header>
					<RoomCodePanel code={snapshot.code} />
				</div>

				<Card className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
					<CardHeader>
						<CardTitle>
							<h2>
								Players {snapshot.players.length}/{maxPlayers}
							</h2>
						</CardTitle>
						<CardDescription>
							{snapshot.players.length < 2
								? "Share the code. You need at least one friend to play."
								: "Everyone here will play together."}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<ConnectionStatus status={connection} />
						<PlayerList
							players={snapshot.players}
							hostId={snapshot.hostId}
							currentUserId={user.id}
							maxPlayers={maxPlayers}
						/>
					</CardContent>
					<CardFooter className="flex-col items-stretch gap-2">
						{isHost ? (
							<>
								<Button
									variant="go"
									size="lg"
									disabled
									aria-describedby="start-hint"
								>
									<Play aria-hidden="true" className="fill-current" /> Start
									game
								</Button>
								<p
									id="start-hint"
									className="text-center text-muted-foreground text-sm"
								>
									Starting a game arrives with the game engine. For now, gather
									your players here.
								</p>
							</>
						) : (
							<p className="text-center font-semibold text-muted-foreground">
								Waiting for {host?.name ?? "the host"} to start the game…
							</p>
						)}
					</CardFooter>
				</Card>

				{/* After the players in reading order, so phones show code → players → rules. */}
				<div className="space-y-6 lg:col-start-1 lg:row-start-2">
					<Card size="sm">
						<CardHeader>
							<CardTitle>
								<h2>House rules</h2>
							</CardTitle>
						</CardHeader>
						<CardContent>
							<dl className="grid grid-cols-3 gap-3 text-center">
								<Rule
									icon={<Users />}
									label="Players"
									value={`${maxPlayers}`}
								/>
								<Rule icon={<Repeat />} label="Rounds" value={`${rounds}`} />
								<Rule
									icon={<Clock />}
									label="Draw time"
									value={`${drawTimeSeconds}s`}
								/>
							</dl>
						</CardContent>
					</Card>
					<Button
						variant="destructive"
						className="w-full"
						disabled={leaving}
						onClick={leave}
					>
						<LogOut aria-hidden="true" />
						{leaving ? "Leaving…" : "Leave room"}
					</Button>
				</div>
			</div>
		</main>
	);
}

function Rule({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="space-y-1 rounded-xl bg-muted p-3">
			<dt className="flex items-center justify-center gap-1.5 font-bold text-muted-foreground text-xs [&_svg]:size-3.5">
				<span aria-hidden="true">{icon}</span>
				{label}
			</dt>
			<dd className="font-display font-semibold text-2xl">{value}</dd>
		</div>
	);
}

function BackToPlay({ label = "Back to play" }: { label?: string }) {
	return (
		<Button
			size="sm"
			variant="outline"
			render={<Link href={"/play" as Route} />}
			nativeButton={false}
		>
			{label}
		</Button>
	);
}

function RoomProblem({
	title,
	description,
	actions,
}: {
	title: string;
	description: string;
	actions: React.ReactNode;
}) {
	return (
		<main className="mx-auto w-full max-w-lg px-4 pt-16">
			<Alert
				title={title}
				action={<div className="flex flex-wrap gap-2">{actions}</div>}
			>
				{description}
			</Alert>
		</main>
	);
}

function BlockerView({
	blocker,
	code,
	onRetry,
	onRedirecting,
}: {
	blocker: RoomBlocker;
	code: string;
	onRetry: () => void;
	onRedirecting: boolean;
}) {
	if (onRedirecting) {
		return <Loader label="Your session ended. Taking you to sign in…" />;
	}
	switch (blocker.kind) {
		case "replaced":
			return (
				<RoomProblem
					title="This room is open somewhere else"
					description="You connected from another tab or device, so this one paused. Continue here to move the connection back."
					actions={
						<>
							<Button size="sm" onClick={onRetry}>
								Use this tab
							</Button>
							<BackToPlay />
						</>
					}
				/>
			);
		case "unreachable":
			return (
				<RoomProblem
					title="Can’t reach the game server"
					description="We tried to reconnect several times. Check your connection, then try again. Your seat is kept for about 30 seconds."
					actions={
						<>
							<Button size="sm" onClick={onRetry}>
								Try again
							</Button>
							<BackToPlay />
						</>
					}
				/>
			);
		case "removed":
			return (
				<RoomProblem
					title="You left this room"
					description="You left from another tab or device."
					actions={
						<>
							<Button size="sm" onClick={onRetry}>
								Rejoin
							</Button>
							<BackToPlay />
						</>
					}
				/>
			);
		case "error":
			return <JoinErrorView code={code} blocker={blocker} onRetry={onRetry} />;
	}
}

function JoinErrorView({
	code,
	blocker,
	onRetry,
}: {
	code: string;
	blocker: Extract<RoomBlocker, { kind: "error" }>;
	onRetry: () => void;
}) {
	const { title, description } = describeRoomError(blocker.error);
	const conflict = blocker.error.code === "ALREADY_IN_ROOM";
	const [otherRoom, setOtherRoom] = useState<string | null>(null);
	const [leaving, setLeaving] = useState(false);

	useEffect(() => {
		if (!conflict) return;
		let cancelled = false;
		getCurrentRoomCode().then((result) => {
			if (!cancelled && result.ok) setOtherRoom(result.data);
		});
		return () => {
			cancelled = true;
		};
	}, [conflict]);

	async function leaveOtherAndJoin() {
		if (!otherRoom) return;
		setLeaving(true);
		const result = await leaveRoom(otherRoom);
		setLeaving(false);
		if (!result.ok) {
			const failure = describeRoomError(result.error);
			toast.error(failure.title, { description: failure.description });
			return;
		}
		toast(`You left room ${otherRoom}`);
		onRetry();
	}

	let actions: React.ReactNode;
	if (conflict && otherRoom) {
		actions = (
			<>
				<Button size="sm" disabled={leaving} onClick={leaveOtherAndJoin}>
					{leaving ? "Leaving…" : `Leave ${otherRoom} and join ${code}`}
				</Button>
				<Button
					size="sm"
					variant="outline"
					render={<Link href={`/room/${otherRoom}` as Route} />}
					nativeButton={false}
				>
					Back to {otherRoom}
				</Button>
			</>
		);
	} else if (blocker.error.code === "ROOM_FULL" || conflict) {
		actions = (
			<>
				<Button size="sm" onClick={onRetry}>
					Try again
				</Button>
				<BackToPlay />
			</>
		);
	} else {
		actions = <BackToPlay label="Create or join another room" />;
	}

	return (
		<RoomProblem title={title} description={description} actions={actions} />
	);
}
