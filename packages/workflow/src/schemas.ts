import type { TLiteral, TNull, TNumber } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

export const DoneSchema: TLiteral<string> = Type.Const("done", {
  title: "Mark the task as done",
});

export const WaitSchema: TNull = Type.Null({ title: "zZz" });

export const NowSchema: TNumber = Type.Number({
  description: "Number of milliseconds elapsed since the epoch",
});

export const RandomSchema: TNumber = Type.Number({
  title: "Random Number",
  description: `Pseudo-random number that's greater than or equal to 0 and less than 1.`,
});
