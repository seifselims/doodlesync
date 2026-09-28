import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth-card";
import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
	return (
		<AuthCard
			title="Welcome back!"
			description="Sign in to create a room or join your friends."
		>
			<Suspense fallback={<Loader />}>
				<SignInForm />
			</Suspense>
		</AuthCard>
	);
}
