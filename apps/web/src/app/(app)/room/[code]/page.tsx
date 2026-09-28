import type { Metadata } from "next";

import { RoomScreen } from "./room-screen";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { code } = await params;
	return { title: `Room ${code.toUpperCase()}` };
}

export default async function RoomPage({ params }: Props) {
	const { code } = await params;
	return <RoomScreen rawCode={code} />;
}
