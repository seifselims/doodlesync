"use client";

import { Avatar } from "@doodlesync/ui/components/avatar";
import { Button } from "@doodlesync/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@doodlesync/ui/components/dropdown-menu";
import { Skeleton } from "@doodlesync/ui/components/skeleton";
import { ChevronDown, LogIn, LogOut, Play } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { markSigningOut } from "./auth-guard";

export default function UserMenu() {
	const router = useRouter();
	const pathname = usePathname();
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <Skeleton className="h-11 w-28 rounded-xl" />;
	}

	if (!session) {
		const onAuthPage = pathname === "/login" || pathname === "/signup";
		return onAuthPage ? null : (
			<Button
				variant="outline"
				render={<Link href={"/login" as Route} />}
				nativeButton={false}
			>
				<LogIn aria-hidden="true" /> Sign in
			</Button>
		);
	}

	async function signOut() {
		markSigningOut(true);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					toast("Signed out. See you next round!");
					router.replace("/" as Route);
				},
				onError: () => {
					markSigningOut(false);
					toast.error("Couldn’t sign you out", {
						description: "Check your connection and try again.",
					});
				},
			},
		});
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="outline" className="gap-2 pr-3 pl-1.5" />}
				aria-label={`Account menu for ${session.user.name}`}
			>
				<Avatar
					name={session.user.name}
					seed={session.user.id}
					className="size-8 text-xs shadow-none"
				/>
				<span className="hidden max-w-32 truncate sm:inline">
					{session.user.name}
				</span>
				<ChevronDown aria-hidden="true" className="size-4 opacity-70" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56 bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						<span className="block font-bold text-foreground">
							{session.user.name}
						</span>
						<span className="block truncate text-muted-foreground text-xs">
							{session.user.email}
						</span>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => router.push("/play" as Route)}>
					<Play aria-hidden="true" /> Play
				</DropdownMenuItem>
				<DropdownMenuItem variant="destructive" onClick={signOut}>
					<LogOut aria-hidden="true" /> Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
