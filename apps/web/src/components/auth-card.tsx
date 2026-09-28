import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@doodlesync/ui/components/card";

import { Logo } from "./logo";

export function AuthCard({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="w-full max-w-md space-y-6">
			<div className="flex justify-center">
				<Logo className="text-4xl" />
			</div>
			<Card>
				<CardHeader className="text-center">
					<CardTitle>
						<h1 className="text-2xl">{title}</h1>
					</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent>{children}</CardContent>
			</Card>
		</div>
	);
}
