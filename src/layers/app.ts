/**
 * Layer composition for the action's phases.
 *
 * @remarks
 * `ActionRuntime.layer` — which `Action.run` composes — already provides
 * `ActionEnvironment`, `ActionLogger`, `ActionOutputs`, `ActionState`,
 * `NodeServices` (`ChildProcessSpawner`, `FileSystem`, `Path`, …) and
 * `HttpClient`. Nothing here rebuilds any of those: a layer in this module
 * adds ONLY what the default runtime deliberately omits, and REQUIRES the
 * rest.
 *
 * Config-dependent layers take the decided VALUE as a parameter
 * (`makeAppLayer(dryRun)`) so the layer itself stays config-free and the
 * input is decoded exactly once, in `readInputs`. A config-independent layer
 * is a static `const` instead — layers memoize by reference, so bind a
 * shared layer once rather than calling a factory at each composition site.
 *
 * `post` needs nothing beyond the default runtime, so it has no layer here —
 * a layer-less entry is legitimate when the runtime already provides
 * everything the program requires.
 *
 * @module layers/app
 */

import { DryRun } from "@effected/github-actions";
import type { Layer } from "effect";

/**
 * The `main` phase's extra services, built from already-decoded input
 * values.
 *
 * @remarks
 * Today that is only `DryRun` — the rehearsal guard every mutation goes
 * through. As the action grows, compose additions here with
 * `Layer.mergeAll(...)` (and `Layer.provideMerge` when one addition
 * satisfies another's requirement), keeping the add-only-what-the-runtime-
 * omits rule.
 */
export const makeAppLayer = (dryRun: boolean): Layer.Layer<DryRun> => DryRun.layerFrom(dryRun);
