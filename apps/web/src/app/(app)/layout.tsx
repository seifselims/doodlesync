import { RequireAuth } from "@/components/auth-guard";

export default function SignedInLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <RequireAuth>{children}</RequireAuth>;
}
