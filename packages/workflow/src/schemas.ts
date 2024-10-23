import type { TLiteral, TNull, TNumber } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

/**
 * Schema representing a constant "done" value.
 * Used to mark a task as completed.
 */
export const DoneSchema: TLiteral<"done"> = Type.Const("done" as const, {
  title: "Mark the task as done",
});

/**
 * Constant value representing a completed task.
 * This is a typed alternative to the string literal "done".
 */
export const DONE: typeof DoneSchema.static = "done";

/**
 * Schema representing a null value.
 * Used to indicate a waiting or idle state.
 */
export const WaitSchema: TNull = Type.Null({ title: "zZz" });

/**
 * Schema representing the current timestamp.
 * Returns the number of milliseconds elapsed since the Unix epoch.
 */
export const NowSchema: TNumber = Type.Number({
  description: "Number of milliseconds elapsed since the epoch",
});

/**
 * Schema representing a random number.
 * Generates a pseudo-random number between 0 (inclusive) and 1 (exclusive).
 */
export const RandomSchema: TNumber = Type.Number({
  title: "Random Number",
  description: `Pseudo-random number that's greater than or equal to 0 and less than 1.`,
});
