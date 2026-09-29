import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from "@doodlesync/shared";
import { Avatar } from "@doodlesync/ui/components/avatar";
import { Button } from "@doodlesync/ui/components/button";
import { Input } from "@doodlesync/ui/components/input";
import { cn } from "@doodlesync/ui/lib/utils";
import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Show the remaining characters only once they start to matter.
const COUNTER_THRESHOLD = 40;

const timeFormat = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

export function ChatPanel({
	messages,
	currentUserId,
	canSend,
	onSend,
}: {
	messages: ChatMessage[];
	currentUserId: string;
	canSend: boolean;
	onSend: (text: string) => boolean;
}) {
	const [draft, setDraft] = useState("");
	const listRef = useRef<HTMLOListElement>(null);
	// Follow new messages unless the player scrolled up to read older ones.
	const pinnedRef = useRef(true);
	const text = draft.trim();
	const remaining = CHAT_MESSAGE_MAX_LENGTH - text.length;

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when a message arrives
	useEffect(() => {
		const list = listRef.current;
		if (list && pinnedRef.current) list.scrollTop = list.scrollHeight;
	}, [messages]);

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!text) return;
		if (!onSend(text)) {
			toast.error("Message not sent", {
				description: "You’re offline. Wait for the room to reconnect.",
			});
			return;
		}
		pinnedRef.current = true;
		setDraft("");
	}

	return (
		<div className="flex flex-col gap-3">
			<ol
				ref={listRef}
				aria-label="Chat messages"
				aria-live="polite"
				onScroll={(event) => {
					const list = event.currentTarget;
					pinnedRef.current =
						list.scrollHeight - list.scrollTop - list.clientHeight < 24;
				}}
				className="h-64 space-y-3 overflow-y-auto overscroll-contain rounded-xl border-2 border-border bg-muted/40 p-3"
			>
				{messages.length === 0 ? (
					<li className="flex h-full items-center justify-center text-center text-muted-foreground">
						No messages yet. Say hi!
					</li>
				) : (
					messages.map((message) => {
						const own = message.authorId === currentUserId;
						return (
							<li
								key={message.id}
								className="fade-in-0 slide-in-from-bottom-1 flex animate-in items-start gap-2.5 duration-200 motion-reduce:animate-none"
							>
								<Avatar
									name={message.authorName}
									seed={message.authorId}
									className="size-8 text-xs shadow-[0_2px_0_var(--ink)]"
								/>
								<div className="min-w-0 flex-1">
									<p className="flex items-baseline gap-2">
										<span
											className={cn(
												"truncate font-bold",
												own && "text-primary",
											)}
										>
											{own ? "You" : message.authorName}
										</span>
										<time
											dateTime={new Date(message.sentAt).toISOString()}
											className="shrink-0 text-muted-foreground text-xs"
										>
											{timeFormat.format(message.sentAt)}
										</time>
									</p>
									{/* Rendered as plain text; chat is never interpreted as HTML. */}
									<p className="wrap-break-word whitespace-pre-wrap">
										{message.text}
									</p>
								</div>
							</li>
						);
					})
				)}
			</ol>
			<form onSubmit={submit} className="flex items-start gap-2">
				<div className="min-w-0 flex-1 space-y-1">
					<Input
						aria-label="Chat message"
						aria-describedby="chat-remaining"
						autoComplete="off"
						placeholder={canSend ? "Type a message…" : "Reconnecting…"}
						maxLength={CHAT_MESSAGE_MAX_LENGTH}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
					/>
					<p
						id="chat-remaining"
						className={cn(
							"px-1 text-muted-foreground text-xs",
							remaining > COUNTER_THRESHOLD && "sr-only",
						)}
					>
						{remaining} characters left
					</p>
				</div>
				<Button type="submit" size="icon" disabled={!canSend || !text}>
					<SendHorizontal aria-hidden="true" />
					<span className="sr-only">Send message</span>
				</Button>
			</form>
		</div>
	);
}
