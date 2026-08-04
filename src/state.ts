/**
 * Cross-phase state schemas.
 *
 * `main` and `post` run as separate Node processes; GitHub Actions persists
 * state between them as `STATE_*` env vars. `ActionState.save/get` encode and
 * decode each value through its Schema.
 *
 * Every field's ENCODED form must be plain JSON — the value crosses
 * `GITHUB_STATE` as `JSON.stringify(encoded)`. An optional field must use
 * `Schema.OptionFromNullOr`, never `Schema.Option`: `Schema.Option` encodes to
 * an `Option` instance whose `toJSON` writes `{"_id":"Option",…}`, which no
 * later phase can decode — a save `main` reports successful that `post`
 * cannot read.
 *
 * @module state
 */

import { Schema } from "effect";

/**
 * Wall-clock timestamp captured by `main` for post-phase duration reporting.
 */
export class StartTimeState extends Schema.Class<StartTimeState>("StartTimeState")({
	startedAt: Schema.Number,
}) {}

/**
 * Keys used with `ActionState.save/get/getOptional`. Internal only — not part
 * of this action's contract, free to change without notice.
 */
export const STATE_KEYS = {
	startTime: "startTime",
} as const;
