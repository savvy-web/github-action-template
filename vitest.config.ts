import { AgentPlugin } from "@vitest-agent/plugin";
import { configDefaults, defineConfig } from "vitest/config";

export default async () => {
	const { projects, tags } = await AgentPlugin.discover();
	return defineConfig({
		plugins: [
			AgentPlugin({
				console: {
					human: "stream",
					agent: "agent",
				},
				coverageTargets: AgentPlugin.COVERAGE_LEVELS.strict.coverageTargets,
			}),
		],
		test: {
			...(projects ? { projects } : {}),
			tags,
			// `.repos/` holds read-only vendored upstream source (see /silk:repos).
			// It ships hundreds of its own `*.test.ts` files that are not this
			// repo's tests; vitest's defaults do not know about it.
			exclude: [...configDefaults.exclude, "**/.repos/**"],
			pool: "forks",
			globalSetup: ["vitest.setup.ts"],
			coverage: {
				enabled: true,
				provider: "v8",
				thresholds: AgentPlugin.COVERAGE_LEVELS.strict.thresholds,
				// Score never-imported src files as 0% instead of silently omitting them.
				include: ["src/**/*.ts"],
				exclude: [],
			},
		},
	});
};
