import { WorkflowBuilder, parse, t } from "@rezza.io/workflow";

const schema = t.Object({
  firstNumber: t.Number({ description: "First number" }),
  secondNumber: t.Number({ description: "Second number" }),
});

export default WorkflowBuilder.create()
  .addNode(
    { key: "input", schema },
    () => ({ firstNumber: 0, secondNumber: 0 }),
    (ctx) => {
      const res = parse(
        schema,
        ctx.step({ key: "numbers", description: "Enter new pair", schema }),
      );
      return ["cont", res] as const;
    },
  )
  .addNode(
    { key: "sum", deps: ["input"], schema: t.Number() },
    ({ get }) => get("input").firstNumber + get("input").secondNumber,
  )
  .build();
