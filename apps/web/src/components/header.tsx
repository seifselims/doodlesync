"use client";
import { cn } from "@doodlesync/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import { Logo } from "./logo";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	const pathname = usePathname();
	const { data: session } = authClient.useSession();
	// "Play" is the main destination once signed in.
	const links: { to: Route; label: string }[] = session
		? [{ to: "/play" as Route, label: "Play" }]
		: [];

	return (
		<header className="sticky top-0 z-40 border-ink/10 border-b-2 bg-background/70 backdrop-blur-xl backdrop-saturate-150 contrast-more:border-ink contrast-more:bg-background [@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none">
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
				<div className="flex min-w-0 items-center gap-3 sm:gap-5">
					<Link
						href="/"
						aria-label="DoodleSync home"
						className="rounded-lg outline-none transition-transform duration-100 focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95 motion-reduce:transition-none"
					>
						<Logo />
					</Link>
					<nav className="flex gap-1">
						{links.map(({ to, label }) => (
							<Link
								key={to}
								href={to}
								aria-current={pathname.startsWith(to) ? "page" : undefined}
								className={cn(
									"rounded-full px-3 py-1.5 font-bold text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60",
									"aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground",
								)}
							>
								{label}
							</Link>
						))}
					</nav>
				</div>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
