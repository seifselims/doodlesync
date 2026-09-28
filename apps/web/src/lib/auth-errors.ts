// Shape of `context.error` passed to Better Auth client `onError` callbacks.
export type AuthApiError = {
	code?: string;
	message?: string;
	status: number;
};

export type AuthErrorCopy = {
	title: string;
	description: string;
	// Set when the fix is to use the other auth form (e.g. the account exists).
	suggest?: "sign-in" | "sign-up";
};

type AuthAction = "sign-in" | "sign-up";

const failedTitle: Record<AuthAction, string> = {
	"sign-in": "Couldn’t sign you in",
	"sign-up": "Couldn’t create your account",
};

// Thrown `fetch` failures never reach `onError`, so forms report them here.
export function networkAuthError(): AuthErrorCopy {
	return {
		title: "Can’t reach the game server",
		description: "Check your connection, then try again.",
	};
}

// Player-facing copy for Better Auth error codes and statuses.
export function describeAuthError(
	error: AuthApiError,
	action: AuthAction,
): AuthErrorCopy {
	switch (error.code) {
		case "USER_ALREADY_EXISTS":
		case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
			return {
				title: "That email already has an account",
				description:
					"Sign in with it instead, or use a different email to make a new account.",
				suggest: "sign-in",
			};
		case "INVALID_EMAIL_OR_PASSWORD":
		case "INVALID_PASSWORD":
		case "CREDENTIAL_ACCOUNT_NOT_FOUND":
			return {
				title: "Email or password is wrong",
				description:
					"Check both and try again. New here? Create an account instead.",
				suggest: "sign-up",
			};
		case "INVALID_EMAIL":
			return {
				title: failedTitle[action],
				description:
					"That email address doesn’t look right. Check it and try again.",
			};
		case "PASSWORD_TOO_SHORT":
			return {
				title: failedTitle[action],
				description: "Your password needs at least 8 characters.",
			};
		case "PASSWORD_TOO_LONG":
			return {
				title: failedTitle[action],
				description: "Your password can be at most 128 characters.",
			};
		case "EMAIL_NOT_VERIFIED":
			return {
				title: "Verify your email first",
				description: "Open the link we emailed you, then sign in again.",
			};
		case "INVALID_ORIGIN":
		case "MISSING_OR_NULL_ORIGIN":
			return {
				title: failedTitle[action],
				description:
					"The game server didn’t accept this site’s address. Check the server’s CORS_ORIGIN setting.",
			};
	}

	if (error.status === 429) {
		return {
			title: "Slow down a little",
			description: "Too many attempts. Wait a minute, then try again.",
		};
	}
	if (error.status >= 500) {
		return {
			title: "The game server hit a snag",
			description: "It’s not you. Try again in a moment.",
		};
	}
	if (error.status === 400 || error.status === 422) {
		return {
			title: failedTitle[action],
			description:
				"Some details weren’t accepted. Check the fields and try again.",
		};
	}
	return {
		title: failedTitle[action],
		description: "Something unexpected happened. Try again in a moment.",
	};
}
