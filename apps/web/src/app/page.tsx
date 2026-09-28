"use client";

import { Button } from "@doodlesync/ui/components/button";
import { Brush, LogIn, Palette, Pencil, Play, Sparkles } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { authClient } from "@/lib/auth-client";

const steps = [
	{
		icon: <Sparkles />,
		title: "Make a room",
		body: "Pick the rounds and draw time, then share the code.",
		color: "bg-pop-sun",
	},
	{
		icon: <Pencil />,
		title: "Draw the word",
		body: "One player sketches while everyone else races to guess.",
		color: "bg-pop-pink",
	},
	{
		icon: <Brush />,
		title: "Guess fast",
		body: "Quicker guesses score more. Highest total wins.",
		color: "bg-pop-teal",
	},
];

export default function Home() {
	const { data: session, isPending } = authClient.useSession();

	return (
		<main className="px-4 pt-12 pb-24 sm:pt-20">
			<div className="mx-auto flex max-w-4xl flex-col items-center gap-14 text-center">
				<section className="flex flex-col items-center gap-6">
					<span
						aria-hidden="true"
						className="sticker flex size-14 -rotate-12 items-center justify-center rounded-2xl bg-pop-violet text-[#1b1f3b] [&_svg]:size-7"
					>
						<Palette />
					</span>
					<h1 className="sr-only">DoodleSync</h1>
					<Logo size="hero" />
					<p className="max-w-md text-balance font-semibold text-lg text-muted-foreground">
						Draw it. Guess it. Laugh about it. A multiplayer sketch-and-guess
						game for you and your friends.
					</p>
					<div className="flex min-h-14 flex-wrap justify-center gap-4">
						{isPending ? null : session ? (
							<Button
								size="lg"
								variant="go"
								render={<Link href={"/play" as Route} />}
								nativeButton={false}
							>
								<Play aria-hidden="true" className="fill-current" /> Play now
							</Button>
						) : (
							<>
								<Button
									size="lg"
									variant="go"
									render={<Link href={"/signup" as Route} />}
									nativeButton={false}
								>
									<Sparkles aria-hidden="true" /> Create an account
								</Button>
								<Button
									size="lg"
									variant="outline"
									render={<Link href={"/login" as Route} />}
									nativeButton={false}
								>
									<LogIn aria-hidden="true" /> Sign in
								</Button>
							</>
						)}
					</div>
				</section>
				<ol className="grid w-full gap-5 text-left sm:grid-cols-3">
					{steps.map((step, index) => (
						<li
							key={step.title}
							className="space-y-3 rounded-2xl border-2 border-ink bg-card p-5 shadow-[0_5px_0_var(--ink)]"
						>
							<span
								aria-hidden="true"
								className={`flex size-11 items-center justify-center rounded-xl border-2 border-ink text-[#1b1f3b] [&_svg]:size-5 ${step.color}`}
							>
								{step.icon}
							</span>
							<h2 className="font-display font-semibold text-xl">
								<span className="text-muted-foreground">{index + 1}.</span>{" "}
								{step.title}
							</h2>
							<p className="text-muted-foreground">{step.body}</p>
						</li>
					))}
				</ol>
			</div>
		</main>
	);
}
