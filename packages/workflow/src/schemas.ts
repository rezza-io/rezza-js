import { Type } from "@sinclair/typebox";

export const DoneSchema = Type.Object({});

export const WaitSchema = Type.Object({});

export const NowSchema = Type.Number({
  description: "Number of milliseconds elapsed since the epoch",
});

export const RandomSchema = Type.Number({
  title: "Random Number",
  description: `Pseudo-random number that's greater than or equal to 0 and less than 1.`,
});
