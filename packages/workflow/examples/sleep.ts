import { WorkflowBuilder, parse, schemas, t } from "@rezza.io/workflow";

const DurationSchema = t.Object(
  {
    duration: t.Number({
      title: "Sleep Duration",
      description: "Sleep duration in ms",
    }),
  },
  { title: "Decide Sleep Duration" },
);

export default WorkflowBuilder.create()
  .addNode({ key: "decide", schema: DurationSchema }, (ctx) => {
    const enter_step = ctx.step({
      key: "enter_duration",
      description: "How long should I sleep?",
      schema: DurationSchema,
    });
    return parse(DurationSchema, enter_step);
  })
  .addNode(
    { key: "wake_up", deps: ["decide"], schema: schemas.DoneSchema },
    ({ get, sleep }) => {
      sleep(get("decide").duration);
      return {};
    },
  )
  .build();
