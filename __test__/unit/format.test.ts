import { assert, describe, it } from "@effect/vitest";
import {
	buildSummaryPanel,
	formatDurationLine,
	formatGreeting,
	formatSkipped,
	resultLines,
	runContextLines,
} from "../../src/format.js";
import { initialOutputs } from "../../src/schema/outputs.js";

const inputs = { name: "world", emphatic: false, writeSummary: true, dryRun: false };

describe("formatGreeting", () => {
	it("renders the plain greeting", () => {
		assert.strictEqual(formatGreeting("world", false), "Hello, world.");
	});

	it("renders the emphatic greeting", () => {
		assert.strictEqual(formatGreeting("world", true), "Hello, world!");
	});
});

describe("buildSummaryPanel", () => {
	it("carries the same rendered greeting the log line shows", () => {
		// The single-rendering-surface invariant: panel cell and log line both
		// come from formatGreeting, so they cannot disagree.
		const greeting = formatGreeting("panel", true);
		const panel = buildSummaryPanel({ ...initialOutputs, greeting });
		assert.include(panel, greeting);
		assert.include(panel, "Greeting Report");
	});
});

describe("log blocks", () => {
	it("opens with the run-context header and names every input", () => {
		const lines = runContextLines(inputs);
		assert.strictEqual(lines[0], "Run context:");
		assert.isTrue(lines.some((line) => line.includes("name: world")));
		assert.isTrue(lines.some((line) => line.includes("dry-run: false")));
	});

	it("closes with the result header and names every output", () => {
		const lines = resultLines({ greeting: "Hello, world.", summaryWritten: true, dryRun: false });
		assert.strictEqual(lines[0], "Result:");
		assert.isTrue(lines.some((line) => line.includes("greeting: Hello, world.")));
		assert.isTrue(lines.some((line) => line.includes("summary-written: true")));
		assert.isTrue(lines.some((line) => line.includes("dry-run: false")));
	});

	it("renders the one SKIPPED shape", () => {
		assert.strictEqual(formatSkipped("Write job summary", "disabled"), "Step: Write job summary — SKIPPED: disabled");
	});

	it("renders the duration in seconds", () => {
		assert.strictEqual(formatDurationLine(1500), "Action completed in 1.50s");
	});
});
