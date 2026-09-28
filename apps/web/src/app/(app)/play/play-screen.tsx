"use client";

import { type RoomSettings, roomCodeSchema } from "@doodlesync/shared";
import { Alert } from "@doodlesync/ui/components/alert";
import { Button } from "@doodlesync/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@doodlesync/ui/components/card";
import { Input } from "@doodlesync/ui/components/input";
import { Label } from "@doodlesync/ui/components/label";
import { cn } from "@doodlesync/ui/lib/utils";
import { DoorOpen, Plus } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useSignedInUser } from "@/components/auth-guard";
import { CurrentRoomBanner } from "@/components/room/current-room-banner";
import { Stepper } from "@/components/room/stepper";
import { describeRoomError } from "@/lib/room-errors";
import {
	createRoom,
	getCurrentRoomCode,
	joinRoom,
	type RoomApiError,
} from "@/lib/rooms-api";

const DEFAULT_SETTINGS: RoomSettings = {
	maxPlayers: 8,
	rounds: 3,
	drawTimeSeconds: 80,
};

export function PlayScreen() {
	const user = useSignedInUser();
	const [currentCode, setCurrentCode] = useState<string | null>(null);

	async function refreshCurrentRoom() {
		const result = await getCurrentRoomCode();
		if (result.ok) setCurrentCode(result.data);
	}

	useEffect(() => {
		let cancelled = false;
		getCurrentRoomCode().then((result) => {
			if (!cancelled && result.ok) setCurrentCode(result.data);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<main className="px-4 pt-10 pb-20 sm:pt-14">
			<div className="mx-auto max-w-5xl space-y-8">
				<header className="space-y-2">
					<h1 className="font-display font-semibold text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
						Ready to doodle, {user.name}?
					</h1>
					<p className="text-lg text-muted-foreground">
						Start a private room for your friends, or hop into theirs with a
						code.
					</p>
				</header>
				{currentCode && (
					<CurrentRoomBanner
						code={currentCode}
						onLeft={() => setCurrentCode(null)}
					/>
				)}
				<div className="grid items-start gap-8 md:grid-cols-2">
					<CreateRoomCard onConflict={refreshCurrentRoom} />
					<JoinRoomCard onConflict={refreshCurrentRoom} />
				</div>
			</div>
		</main>
	);
}

function ErrorAlert({
	error,
	onDismiss,
}: {
	error: RoomApiError;
	onDismiss: () => void;
}) {
	const { title, description } = describeRoomError(error);
	return (
		<Alert
			title={title}
			action={
				<Button size="sm" variant="outline" type="button" onClick={onDismiss}>
					Dismiss
				</Button>
			}
		>
			{description}
			{error.code === "ALREADY_IN_ROOM" &&
				" Use the banner above to go back to it or leave it."}
		</Alert>
	);
}

function CreateRoomCard({ onConflict }: { onConflict: () => void }) {
	const router = useRouter();
	const [settings, setSettings] = useState(DEFAULT_SETTINGS);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<RoomApiError | null>(null);

	async function submit(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setCreating(true);
		setError(null);
		const result = await createRoom(settings);
		if (result.ok) {
			toast.success(`Room ${result.data.code} is ready`, {
				description: "Share the code or invite link with your friends.",
			});
			router.push(`/room/${result.data.code}` as Route);
			return;
		}
		setCreating(false);
		setError(result.error);
		if (result.error.code === "ALREADY_IN_ROOM") onConflict();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>Create a private room</h2>
				</CardTitle>
				<CardDescription>
					You’ll be the host. Tweak the rules first.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-5" onSubmit={submit}>
					<div className="space-y-4 rounded-2xl border-2 border-border border-dashed p-4">
						<Stepper
							id="max-players"
							label="Players"
							value={settings.maxPlayers}
							min={2}
							max={12}
							onChange={(maxPlayers) =>
								setSettings({ ...settings, maxPlayers })
							}
						/>
						<Stepper
							id="rounds"
							label="Rounds"
							value={settings.rounds}
							min={1}
							max={10}
							onChange={(rounds) => setSettings({ ...settings, rounds })}
						/>
						<Stepper
							id="draw-time"
							label="Draw time"
							value={settings.drawTimeSeconds}
							min={30}
							max={180}
							step={10}
							format={(seconds) => `${seconds}s`}
							onChange={(drawTimeSeconds) =>
								setSettings({ ...settings, drawTimeSeconds })
							}
						/>
					</div>
					<Button
						type="submit"
						size="lg"
						className="w-full"
						disabled={creating}
					>
						<Plus aria-hidden="true" />
						{creating ? "Creating room…" : "Create room"}
					</Button>
					{error && (
						<ErrorAlert error={error} onDismiss={() => setError(null)} />
					)}
				</form>
			</CardContent>
		</Card>
	);
}

function JoinRoomCard({ onConflict }: { onConflict: () => void }) {
	const router = useRouter();
	const [code, setCode] = useState("");
	const [touched, setTouched] = useState(false);
	const [joining, setJoining] = useState(false);
	const [error, setError] = useState<RoomApiError | null>(null);
	const parsed = roomCodeSchema.safeParse(code);
	const invalid = touched && !parsed.success;

	async function submit(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setTouched(true);
		if (!parsed.success) return;
		setJoining(true);
		setError(null);
		const result = await joinRoom(parsed.data);
		if (result.ok) {
			router.push(`/room/${result.data.code}` as Route);
			return;
		}
		setJoining(false);
		setError(result.error);
		if (result.error.code === "ALREADY_IN_ROOM") onConflict();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>Join with a code</h2>
				</CardTitle>
				<CardDescription>
					Got an invite link? Just open it. Otherwise type the code here.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-5" onSubmit={submit} noValidate>
					<div className="space-y-2">
						<Label htmlFor="room-code">Room code</Label>
						<Input
							id="room-code"
							value={code}
							onChange={(event) => {
								setCode(
									event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
								);
								setError(null);
							}}
							onBlur={() => setTouched(code.length > 0)}
							placeholder="K7PQ2A"
							maxLength={6}
							autoComplete="off"
							autoCapitalize="characters"
							spellCheck={false}
							aria-invalid={invalid || undefined}
							aria-describedby="room-code-message"
							className="h-14 text-center font-mono text-2xl uppercase tracking-[0.35em] md:text-2xl"
						/>
						<p
							id="room-code-message"
							className={cn(
								"font-semibold text-sm",
								invalid ? "text-destructive" : "text-muted-foreground",
							)}
						>
							{invalid
								? "Codes are six characters: letters and the digits 2–9."
								: "Ask your host for the six-character code."}
						</p>
					</div>
					<Button
						type="submit"
						variant="go"
						size="lg"
						className="w-full"
						disabled={joining}
					>
						<DoorOpen aria-hidden="true" />
						{joining ? "Joining…" : "Join room"}
					</Button>
					{error && (
						<ErrorAlert error={error} onDismiss={() => setError(null)} />
					)}
				</form>
			</CardContent>
		</Card>
	);
}
