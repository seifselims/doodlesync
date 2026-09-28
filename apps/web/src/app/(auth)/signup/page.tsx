import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth-card";
import Loader from "@/components/loader";
import SignUpForm from "@/components/sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
	return (
		<AuthCard
			title="Grab a pencil"
			description="Make an account to start drawing and guessing with friends."
		>
			<Suspense fallback={<Loader />}>
				<SignUpForm />
			</Suspense>
		</AuthCard>
	);
}
