import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
	// The old scaffold dashboard is replaced by the play hub.
	async redirects() {
		return [{ source: "/dashboard", destination: "/play", permanent: false }];
	},
};

export default withVarlock(nextConfig);
