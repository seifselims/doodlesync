import { RedirectIfSignedIn } from "@/components/auth-guard";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<main className="flex items-start justify-center px-4 pt-10 pb-20 sm:pt-16">
			<RedirectIfSignedIn>{children}</RedirectIfSignedIn>
		</main>
	);
}
