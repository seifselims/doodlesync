// Application close codes (4000–4999) sent when the server ends a room socket.
export const socketCloseCodes = {
	// The same account opened a newer connection; clients must not auto-reconnect.
	replaced: 4001,
} as const;
