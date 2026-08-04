import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, describe, it } from "@effect/vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Every file under `directory` (recursive) whose name passes `keep`. */
const walk = (directory: string, keep: (name: string) => boolean): Array<string> => {
	const found: Array<string> = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules") continue;
			found.push(...walk(path, keep));
		} else if (keep(entry.name)) {
			found.push(path);
		}
	}
	return found;
};

/** The package name of an import specifier, or undefined for relative/builtin. */
const packageOf = (specifier: string): string | undefined => {
	if (specifier.startsWith(".") || specifier.startsWith("node:")) return undefined;
	const segments = specifier.split("/");
	return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
};

/** Every package imported by the files, from static and dynamic import forms. */
const importedPackages = (files: ReadonlyArray<string>): Set<string> => {
	const packages = new Set<string>();
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/from\s+"([^"]+)"|import\(\s*"([^"]+)"\s*\)/g)) {
			const name = packageOf(match[1] ?? match[2] ?? "");
			if (name !== undefined) packages.add(name);
		}
	}
	return packages;
};

/**
 * The transitive peer-dependency closure of a set of installed packages.
 *
 * @remarks
 * Some packages are REQUIRED PEERS of others and legitimately never imported
 * by `src/` — `@effect/platform-node` is a required peer of
 * `@effected/github-actions`. The honesty rule below resolves this closure
 * before flagging, so a peer-required dependency is not a false positive.
 */
const peerClosure = (roots: ReadonlySet<string>): Set<string> => {
	const closure = new Set<string>();
	const queue = [...roots];
	while (queue.length > 0) {
		const name = queue.pop();
		if (name === undefined || closure.has(name)) continue;
		closure.add(name);
		try {
			const manifest = JSON.parse(readFileSync(join(repoRoot, "node_modules", name, "package.json"), "utf8")) as {
				peerDependencies?: Record<string, string>;
			};
			for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
				queue.push(peer);
			}
		} catch {
			// Not installed at the root — nothing to close over.
		}
	}
	return closure;
};

describe("dependency honesty", () => {
	it("declares no dependency that src/ neither imports nor peer-requires", () => {
		const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
			dependencies?: Record<string, string>;
		};
		const declared = Object.keys(manifest.dependencies ?? {});
		const sources = walk(join(repoRoot, "src"), (name) => name.endsWith(".ts"));
		const allowed = peerClosure(importedPackages(sources));
		const unjustified = declared.filter((name) => !allowed.has(name));
		assert.deepStrictEqual(
			unjustified,
			[],
			`Declared dependencies neither imported by src/ nor in the peer closure: ${unjustified.join(", ")}`,
		);
	});
});

describe("test harness", () => {
	it("every test file runs on @effect/vitest", () => {
		// A declared-but-never-imported harness is invisible without this: the
		// suite would silently run on plain vitest while claiming the canon.
		const tests = walk(join(repoRoot, "__test__"), (name) => name.endsWith(".test.ts"));
		const offenders = tests.filter((file) => !readFileSync(file, "utf8").includes('from "@effect/vitest"'));
		assert.deepStrictEqual(
			offenders.map((file) => file.slice(repoRoot.length)),
			[],
			"Every *.test.ts must import from @effect/vitest",
		);
	});
});

describe("test placement", () => {
	it("collects every test file: unit/ or integration/, nowhere else", () => {
		// The collection contract: a *.test.ts outside these two directories can
		// be silently skipped by project-scoped discovery, and a skipped suite
		// is indistinguishable from a green one.
		const tests = walk(join(repoRoot, "__test__"), (name) => name.endsWith(".test.ts"));
		const misplaced = tests.filter((file) => {
			const relative = file.slice(repoRoot.length).replaceAll("\\", "/");
			const inUnit = relative.includes("__test__/unit/");
			const inIntegration = relative.includes("__test__/integration/") && relative.endsWith(".int.test.ts");
			return !(inUnit || inIntegration);
		});
		assert.deepStrictEqual(
			misplaced.map((file) => file.slice(repoRoot.length)),
			[],
		);
	});
});
