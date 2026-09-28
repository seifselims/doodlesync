"use client";

import { Button } from "@doodlesync/ui/components/button";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";

async function copy(text: string, success: string, fallback: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(success);
	} catch {
		toast.error("Couldn’t copy automatically", { description: fallback });
	}
}

export function RoomCodePanel({ code }: { code: string }) {
	const inviteUrl = () => `${window.location.origin}/room/${code}`;
	return (
		<section
			aria-labelledby="room-code-label"
			className="space-y-4 rounded-2xl border-2 border-ink bg-secondary p-5 text-secondary-foreground shadow-[0_5px_0_var(--ink)]"
		>
			<div>
				<p
					id="room-code-label"
					className="font-bold text-xs uppercase tracking-[0.12em] opacity-80"
				>
					Room code
				</p>
				<p className="select-all font-bold font-mono text-4xl tracking-[0.2em]">
					{code}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						copy(code, "Room code copied", `Select it and copy: ${code}`)
					}
				>
					<Copy aria-hidden="true" /> Copy code
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						const url = inviteUrl();
						copy(url, "Invite link copied", `Share this link: ${url}`);
					}}
				>
					<Link2 aria-hidden="true" /> Copy invite link
				</Button>
			</div>
		</section>
	);
}
