import { DoneSchema, WorkflowBuilder, parse, t } from "@rezza.io/workflow";

const schema = t.Union([t.Literal("dog"), t.Literal("cat")], {
  title: "dog or cat?",
});

export default WorkflowBuilder.create()
  .addNode({ key: "input", schema }, (ctx) => {
    const res = ctx.step({
      key: "ask",
      schema,
    });
    return parse(schema, res);
  })
  .addNode(
    { key: "say", deps: ["input"], schema: t.Boolean() },
    ({ get, step }) => {
      if (get("input") === "dog") {
        step({ key: "say_dog", schema: DoneSchema });
      } else {
        step({ key: "say_cat", schema: DoneSchema });
      }
      return true;
    },
  )
  .build();
