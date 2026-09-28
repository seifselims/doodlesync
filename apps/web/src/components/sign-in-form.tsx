"use client";

import { Alert } from "@doodlesync/ui/components/alert";
import { Button } from "@doodlesync/ui/components/button";
import { useForm } from "@tanstack/react-form";
import { LogIn } from "lucide-react";
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

const signInSchema = z.object({
	email: z.email("Enter a valid email address."),
	password: z.string().min(1, "Enter your password."),
});

export default function SignInForm() {
	const router = useRouter();
	const next = useSearchParams().get("next");
	const [formError, setFormError] = useState<AuthErrorCopy | null>(null);

	const form = useForm({
		defaultValues: { email: "", password: "" },
		validators: { onBlur: signInSchema, onSubmit: signInSchema },
		onSubmit: async ({ value }) => {
			setFormError(null);
			try {
				await authClient.signIn.email(
					{ email: value.email.trim(), password: value.password },
					{
						onSuccess: (context) => {
							toast.success(`Welcome back, ${context.data.user.name}!`);
							router.replace(safeNextPath(next));
						},
						onError: (context) => {
							setFormError(describeAuthError(context.error, "sign-in"));
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
						formError.suggest === "sign-up" && (
							<Button
								size="sm"
								variant="outline"
								render={<Link href={withNext("/signup", next)} />}
								nativeButton={false}
							>
								Create an account
							</Button>
						)
					}
				>
					{formError.description}
				</Alert>
			)}
			<form.Field name="email">
				{(field) => (
					<AuthField
						id="email"
						label="Email"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						autoFocus
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
						autoComplete="current-password"
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
						<LogIn aria-hidden="true" />
						{isSubmitting ? "Signing in…" : "Sign in"}
					</Button>
				)}
			</form.Subscribe>
			<p className="text-center text-muted-foreground text-sm">
				New to DoodleSync?{" "}
				<Link
					href={withNext("/signup", next)}
					className="font-bold text-primary underline-offset-4 hover:underline"
				>
					Create an account
				</Link>
			</p>
		</form>
	);
}
