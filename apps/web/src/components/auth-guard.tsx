"use client";

import { Alert } from "@doodlesync/ui/components/alert";
import { Button } from "@doodlesync/ui/components/button";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/safe-redirect";

import Loader from "./loader";

type SignedInUser = (typeof authClient.$Infer.Session)["user"];

const SignedInUserContext = createContext<SignedInUser | null>(null);

/** The current user inside a `RequireAuth` boundary. */
export function useSignedInUser() {
	const user = use(SignedInUserContext);
	if (!user) {
		throw new Error("useSignedInUser must be used inside <RequireAuth>.");
	}
	return user;
}

// Set during a deliberate sign-out so guards send people home, not to sign in.
let signingOut = false;

export function markSigningOut(value: boolean) {
	signingOut = value;
}

function currentPath() {
	return `${window.location.pathname}${window.location.search}`;
}

/**
 * Client-side gate for signed-in pages. The session cookie belongs to the API
 * origin, so the web server cannot check it; the API enforces authorization and
 * this only decides what to render and where to send signed-out visitors.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const { data: session, isPending, error, refetch } = authClient.useSession();
	// Better Auth briefly reports no session while it refreshes (e.g. right after
	// sign-up); keep the last known user so the page does not flash a loader.
	const [lastUser, setLastUser] = useState<SignedInUser | null>(null);
	if (session && session.user !== lastUser) setLastUser(session.user);
	const user = session?.user ?? (isPending ? lastUser : null);
	const signedOut = !isPending && !error && !session;

	useEffect(() => {
		if (!signedOut) return;
		router.replace(
			signingOut
				? ("/" as Route)
				: (`/login?next=${encodeURIComponent(currentPath())}` as Route),
		);
	}, [signedOut, router]);

	if (error && !user) {
		return (
			<div className="mx-auto w-full max-w-md px-4 pt-16">
				<Alert
					title="Can’t reach the game server"
					action={
						<Button size="sm" variant="outline" onClick={() => refetch()}>
							Try again
						</Button>
					}
				>
					We couldn’t check whether you’re signed in. Check your connection and
					try again.
				</Alert>
			</div>
		);
	}

	if (!user) {
		return <Loader label="Checking your pass…" />;
	}

	return <SignedInUserContext value={user}>{children}</SignedInUserContext>;
}

/** Sends visitors who are already signed in to `?next=` (or the play hub). */
export function RedirectIfSignedIn({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (session) {
			signingOut = false;
			const next = new URLSearchParams(window.location.search).get("next");
			router.replace(safeNextPath(next));
		}
	}, [session, router]);

	if (isPending || session) {
		return <Loader />;
	}
	return children;
}
