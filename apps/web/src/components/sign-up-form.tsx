"use client";

import { Alert } from "@doodlesync/ui/components/alert";
import { Button } from "@doodlesync/ui/components/button";
import { useForm } from "@tanstack/react-form";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import {
	type AuthErrorCopy,
	describeAuthError,
	networkAuthError,
} from "@/lib/auth-errors";
import { safeNextPath, withNext } from "@/lib/safe-redirect";

import { AuthField, fieldErrors } from "./auth-fields";

// Better Auth accepts 8–128 character passwords by default.
const signUpSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, "Use at least 2 characters.")
		.max(24, "Keep it to 24 characters so it fits the scoreboard."),
	email: z.email("Enter a valid email address."),
	password: z
		.string()
		.min(8, "Use at least 8 characters.")
		.max(128, "Use 128 characters or fewer."),
});

export default function SignUpForm() {
	const router = useRouter();
	const next = useSearchParams().get("next");
	const [formError, setFormError] = useState<AuthErrorCopy | null>(null);

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		validators: { onBlur: signUpSchema, onSubmit: signUpSchema },
		onSubmit: async ({ value }) => {
			setFormError(null);
			try {
				await authClient.signUp.email(
					{
						name: value.name.trim(),
						email: value.email.trim(),
						password: value.password,
					},
					{
						onSuccess: (context) => {
							toast.success(`Welcome, ${context.data.user.name}!`, {
								description: "Your account is ready. Let’s draw.",
							});
							router.replace(safeNextPath(next));
						},
						onError: (context) => {
							setFormError(describeAuthError(context.error, "sign-up"));
						},
					},
				);
			} catch {
				setFormError(networkAuthError());
			}
		},
	});

	return (
		<form
			noValidate
			className="space-y-5"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				form.handleSubmit();
			}}
		>
			{formError && (
				<Alert
					title={formError.title}
					action={
						formError.suggest === "sign-in" && (
							<Button
								size="sm"
								variant="outline"
								render={<Link href={withNext("/login", next)} />}
								nativeButton={false}
							>
								Go to sign in
							</Button>
						)
					}
				>
					{formError.description}
				</Alert>
			)}
			<form.Field name="name">
				{(field) => (
					<AuthField
						id="name"
						label="Player name"
						autoComplete="nickname"
						placeholder="Picasso"
						maxLength={24}
						autoFocus
						hint="Other players see this in the lobby."
						value={field.state.value}
						errors={fieldErrors(
							field.state.meta,
							field.form.state.submissionAttempts > 0,
						)}
						onChange={field.handleChange}
						onBlur={field.handleBlur}
					/>
				)}
			</form.Field>
			<form.Field name="email">
				{(field) => (
					<AuthField
						id="email"
						label="Email"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						value={field.state.value}
						errors={fieldErrors(
							field.state.meta,
							field.form.state.submissionAttempts > 0,
						)}
						onChange={field.handleChange}
						onBlur={field.handleBlur}
					/>
				)}
			</form.Field>
			<form.Field name="password">
				{(field) => (
					<AuthField
						id="password"
						label="Password"
						type="password"
						autoComplete="new-password"
						hint="At least 8 characters."
						value={field.state.value}
						errors={fieldErrors(
							field.state.meta,
							field.form.state.submissionAttempts > 0,
						)}
						onChange={field.handleChange}
						onBlur={field.handleBlur}
					/>
				)}
			</form.Field>
			<form.Subscribe selector={(state) => state.isSubmitting}>
				{(isSubmitting) => (
					<Button
						type="submit"
						variant="go"
						size="lg"
						className="w-full"
						disabled={isSubmitting}
					>
						<Sparkles aria-hidden="true" />
						{isSubmitting ? "Creating your account…" : "Create account"}
					</Button>
				)}
			</form.Subscribe>
			<p className="text-center text-muted-foreground text-sm">
				Already have an account?{" "}
				<Link
					href={withNext("/login", next)}
					className="font-bold text-primary underline-offset-4 hover:underline"
				>
					Sign in
				</Link>
			</p>
		</form>
	);
}
