import { defineConfig } from "@savvy-web/github-action-builder";

export default defineConfig({
	entries: {
		main: "src/main.ts",
		post: "src/post.ts",
	},
	build: {
		minify: true,
		// `ignore` and `nativeDynamicImports` are added PER-NEED, never
		// pre-emptively — an inert entry teaches the next reader that
		// cargo-culting is fine. When a dependency legitimately needs one,
		// document WHY at the entry with a forensic comment (what breaks
		// without it, and how you proved it). See docs/03-bundler-notes.md
		// for the recorded cases from the silk-* actions: the cyclonedx
		// optional-plugin `ignore` trio (only when @effected/sbom is in the
		// dependency graph) and the `nativeDynamicImports` computed-import
		// rewrites.
	},
	persistLocal: {
		enabled: true,
		path: ".github/actions/local",
	},
});
