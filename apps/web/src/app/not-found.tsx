import { Button } from "@doodlesync/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@doodlesync/ui/components/empty";
import { Eraser } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

export default function NotFound() {
	return (
		<main className="mx-auto w-full max-w-lg px-4 pt-16">
			<Empty className="bg-card">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Eraser aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>
						<h1>This page got erased</h1>
					</EmptyTitle>
					<EmptyDescription>
						The link may be old or mistyped. Head back and start a new round.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button render={<Link href={"/" as Route} />} nativeButton={false}>
						Go home
					</Button>
				</EmptyContent>
			</Empty>
		</main>
	);
}
