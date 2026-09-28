import type { Metadata } from "next";
import { Fredoka, Geist_Mono, Nunito } from "next/font/google";

import "../index.css";
import Header from "@/components/header";
import Providers from "@/components/providers";

const nunito = Nunito({
	variable: "--font-nunito",
	subsets: ["latin"],
});

const fredoka = Fredoka({
	variable: "--font-fredoka",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: { default: "DoodleSync", template: "%s · DoodleSync" },
	description: "Draw it. Guess it. A multiplayer sketch-and-guess game.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${nunito.variable} ${fredoka.variable} ${geistMono.variable} doodle-bg antialiased`}
			>
				<Providers>
					<div className="grid min-h-svh grid-rows-[auto_1fr]">
						<Header />
						{children}
					</div>
				</Providers>
			</body>
		</html>
	);
}
