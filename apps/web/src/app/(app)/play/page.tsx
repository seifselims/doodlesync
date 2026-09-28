import type { Metadata } from "next";

import { PlayScreen } from "./play-screen";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
	return <PlayScreen />;
}
