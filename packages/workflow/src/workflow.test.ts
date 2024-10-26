import { describe, expect, test } from "bun:test";
import dedent from "dedent";
import { Heap } from "heap-js";
import _ from "lodash";
import { WorkflowBuilder, parse, t } from ".";
import sleepWorkflow from "../examples/sleep";
import { RandomSchema } from "./schemas";
import { sleep } from "./utils";

describe("Workflow", () => {
  test("basic usage", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode(
        {
          key: "a",
          title: "a",
          description: "aaaa",
          deps: [],
          schema: t.Number(),
        },
        () => 1,
      )
      .addNode(
        { key: "b", deps: ["a"], schema: t.String() },
        ({ get }) => `hello ${get("a")}`,
      )
      .addNode(
        { key: "c", deps: ["a"], schema: t.Boolean() },
        ({ get }) => get("a") > 0,
      )
      .addNode(
        {
          key: "d",
          deps: ["b", "c"],
          schema: t.Object({ value: t.Number(), flag: t.Boolean() }),
        },
        ({ get }) => ({
          value: get("b").length,
          flag: get("c"),
        }),
      )
      .build();

    // TypeScript infers the correct types
    // console.log(workflow.execute({}));

    expect(workflow.topology()).toMatchSnapshot();
    expect(workflow.getDependencies("d")).toMatchSnapshot();
    expect(await workflow.run([])).toMatchSnapshot();
  });
  test("basic step", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "a", deps: [], schema: t.Number() }, () => 1)
      .addNode(
        { key: "b", deps: ["a"], schema: t.String() },
        ({ get }) => `hello ${get("a")}`,
      )
      .addNode(
        { key: "c", deps: ["a"], schema: t.Boolean() },
        ({ get, step }) => {
          const schema = t.Object({
            x: t.Number({ title: "sweet number" }),
          });
          const { x } = parse(
            schema,
            step({
              key: "need_number",
              title: "Enter a number",
              description: dedent`
              Enter a number
              `,
              schema,
            }),
          );
          return get("a") + x > 0;
        },
      )
      .addNode(
        {
          key: "d",
          deps: ["b", "c"],
          schema: t.Object({
            value: t.Number(),
            flag: t.Boolean(),
          }),
        },
        ({ get }) => ({
          value: get("b").length,
          flag: get("c"),
        }),
      )
      .build();

    // TypeScript infers the correct types
    // console.log(workflow.execute({}));

    expect(workflow.topologicalSort()).toMatchSnapshot();
    expect(workflow.getDependencies("d")).toMatchSnapshot();
    const exec1 = await workflow.dryRun([]);
    expect(exec1.values).toMatchSnapshot();
    expect(exec1.values.c?.status).toBe("intr");
    expect(exec1.values.d?.status).toBe("pending");

    const exec2 = await workflow.dryRun([
      { k: ["c", "need_number"], ts: Date.now(), v: { x: 2 } },
    ]);
    expect(exec2.values).toMatchSnapshot();
    expect(exec2.values.c?.status).toBe("done");

    const exec3 = await workflow.dryRun([
      { k: ["c", "need_number"], ts: Date.now(), v: { y: 2 } },
    ]);
    expect(exec3.values).toMatchSnapshot();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expect(exec3.newEvents.map(({ ts: _ts, ...e }) => e)).toMatchSnapshot();
    expect(exec3.values.c?.status).toBe("err");
  });
  test("simple group", async () => {
    const workflow = WorkflowBuilder.create()
      .addGroup("groupA")
      .addNode({ key: "node1", group: "groupA", schema: t.Number() }, () => 1)
      .addGroup("groupB")
      .addNode(
        {
          key: "node2",
          group: "groupB",
          deps: ["node1"],
          schema: t.Number(),
        },
        ({ get }) => get("node1") + 1,
      )
      .addNode(
        { key: "node3", deps: ["node2"], schema: t.Number() },
        ({ get }) => get("node2") * 2,
      )
      .build();
    await workflow.run([]);
  });
  test("waitUntil", async () => {
    const until = Date.now() + 10;
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1", schema: t.Number() }, ({ waitUntil }) => {
        waitUntil(until);
        return 1;
      })
      .build();
    const res1 = await workflow.dryRun([]);
    expect(res1.values.node1?.status).toBe("intr");
    await sleep(20);
    const res2 = await workflow.dryRun([]);
    expect(res2.values.node1?.status).toBe("done");
  });
  test("sleep", async () => {
    const workflow = sleepWorkflow.spawn();
    const res1 = await workflow.run([
      { k: ["decide", "enter_duration"], v: { duration: 10 }, ts: Date.now() },
    ]);
    expect(res1.wake_up?.status).toBe("intr");
    await sleep(20);
    const res2 = await workflow.run();
    expect(res2.wake_up?.status).toBe("done");
  });
  test("async capture", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1", schema: t.Number() }, (ctx) =>
        ctx.capture({ key: "noop", schema: t.Number() }, async () => {
          await sleep(10);
          return 1;
        }),
      )
      .build();
    const res2 = await workflow.run();
    expect(res2.node1?.status).toBe("done");
  });
  test("async capture that throws", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1", schema: t.Any() }, (ctx) =>
        ctx.capture({ key: "noop", schema: t.Any() }, async () => {
          throw new Error("oops");
        }),
      )
      .build();
    const res2 = await workflow.run();
    expect(res2.node1?.status).toBe("err");
  });

  test("random function", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "randomValue", schema: RandomSchema }, ({ random }) =>
        random(),
      )
      .build();

    const result1 = await workflow.run();
    expect(result1.randomValue?.status).toBe("done");
    if (result1.randomValue?.status === "done") {
      expect(typeof result1.randomValue?.value).toBe("number");
      expect(result1.randomValue?.value).toBeGreaterThanOrEqual(0);
      expect(result1.randomValue?.value).toBeLessThan(1);

      const result2 = await workflow.run();
      expect(result2.randomValue?.status).toBe("done");
      if (result2.randomValue?.status === "done") {
        expect(result2.randomValue?.value).toBe(result1.randomValue?.value);
      }
    }
  });
  test("check step name", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1", schema: t.Number() }, (ctx): number =>
        ctx.capture({ key: "noop", schema: t.Number() }, () => 1),
      )
      .build();
    const res = (
      await workflow.dryRun([{ k: ["node1", "nap"], ts: Date.now(), v: 2 }])
    ).values.node1;

    expect(res?.status).toBe("err");
  });
});

describe("saga function", () => {
  test("finite without intr", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1", schema: t.Number() }, () => 5)
      .addNode(
        { key: "node2", deps: ["node1"], schema: t.Number() },
        ({ get }) => get("node1") * 2,
        (ctx, value: number) =>
          value > 15 ? ["halt", value] : ["cont", value + 1],
      )
      .build();

    const result1 = await workflow.run();
    expect(result1.node2?.status).toBe("done");
    if (result1.node2?.status === "done") {
      expect(result1.node2.value).toBe(16);
    }
  });

  test("infinite", async () => {
    const workflow2 = WorkflowBuilder.create()
      .addNode({ key: "node1", schema: t.Number() }, () => 10)
      .addNode(
        { key: "node2", deps: ["node1"], schema: t.Number() },
        ({ get }) => get("node1") * 2,
        (ctx) => {
          const schema = t.Number();
          const stepResult = ctx.step({
            key: "addition",
            description: "Enter a number for addition",
            schema: schema,
          });
          return ["cont", parse(schema, stepResult) + ctx.get("node1") * 2];
        },
      )
      .build();

    const result = await workflow2.run();
    expect(result.node2?.status).toBe("intr");
    if (result.node2?.status === "intr") {
      expect(result.node2?.value).toBe(20);
    }
    const result2 = await workflow2.run([
      { k: ["node2", "addition"], ts: Date.now(), v: 5 },
    ]);
    expect(result2.node2?.status).toBe("intr");
    if (result2.node2?.status === "intr") {
      expect(result2.node2?.value).toBe(25);
    }
  });

  test("depends on a saga with intr", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode(
        { key: "node1", schema: t.Number() },
        (): number => 5,
        (ctx, value) => {
          const schema = t.Number();
          return [
            "cont",
            parse(
              schema,
              ctx.step({
                key: "addition",
                description: "Enter a number for addition",
                schema,
              }),
            ) + value,
          ];
        },
      )
      .addNode(
        { key: "node2", deps: ["node1"], schema: t.Number() },
        ({ get }) => get("node1") * 2,
      )
      .build();

    const result1 = await workflow.run();
    expect(result1.node1?.status).toBe("intr");
    expect(result1.node2?.status).toBe("done");
    expect(result1.node1?.status === "intr" && result1.node1.value).toBe(5);
    expect(result1.node2?.status === "done" && result1.node2.value).toBe(10);

    const result2 = await workflow.run([
      { k: ["node1", "addition"], ts: Date.now(), v: 3 },
    ]);
    expect(result2.node1?.status).toBe("intr");
    expect(result2.node2?.status).toBe("done");
    expect(result2.node1?.status).toBe("intr");
    expect(result2.node2?.status).toBe("done");
    expect(result2.node1?.status === "intr" && result2.node1.value).toBe(8);
    expect(result2.node2?.status === "done" && result2.node2.value).toBe(16);
  });
  test("saga without intr should timeout", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode(
        { key: "node1", schema: t.Number() },
        (): number => 0,
        (ctx, value) => ["cont", value + 1],
      )
      .build();

    try {
      await workflow.run([], { timeout: 100 });
    } catch (e) {
      if (e instanceof Error) {
        expect(e.message).toBe("Timeout");
      }
    }
  });

  const ONE_DAY = 24 * 60 * 60 * 1000;

  const learningWorkflow = () => {
    type SuperMemoItem = {
      interval: number;
      repetition: number;
      efactor: number;
    };

    type SuperMemoGrade = 0 | 1 | 2 | 3 | 4 | 5;

    function supermemo(
      item: SuperMemoItem,
      grade: SuperMemoGrade,
    ): SuperMemoItem {
      let nextInterval: number;
      let nextRepetition: number;
      let nextEfactor: number;

      if (grade >= 3) {
        if (item.repetition === 0) {
          nextInterval = 1;
          nextRepetition = 1;
        } else if (item.repetition === 1) {
          nextInterval = 6;
          nextRepetition = 2;
        } else {
          nextInterval = Math.round(item.interval * item.efactor);
          nextRepetition = item.repetition + 1;
        }
      } else {
        nextInterval = 1;
        nextRepetition = 0;
      }

      nextEfactor =
        item.efactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));

      if (nextEfactor < 1.3) nextEfactor = 1.3;

      return {
        interval: nextInterval,
        repetition: nextRepetition,
        efactor: nextEfactor,
      };
    }
    const gradeSchema = t.Union([
      t.Literal(0),
      t.Literal(1),
      t.Literal(2),
      t.Literal(3),
      t.Literal(4),
      t.Literal(5),
    ]);
    return WorkflowBuilder.create()
      .addNode(
        {
          key: "supermemo",
          schema: t.Object({
            interval: t.Number(),
            repetition: t.Number(),
            efactor: t.Number(),
          }),
        },
        (): SuperMemoItem => ({
          interval: 0,
          repetition: 0,
          efactor: 2.5,
        }),
        (ctx, item) => {
          const reviewResult = ctx.step({
            key: "review",
            description: "Review the item",
            schema: gradeSchema,
          });
          const grade = parse(gradeSchema, reviewResult);
          const newItem = supermemo(item, grade);
          ctx.sleep(newItem.interval * ONE_DAY);
          return ["cont", newItem];
        },
      )
      .build();
  };
  test("supermemo", async () => {
    const workflow = learningWorkflow();
    await workflow.run();
    const result = await workflow.run([
      { k: ["supermemo", "review"], ts: Date.now(), v: 5 },
    ]);
    expect(result.supermemo?.status).toBe("intr");
    expect(
      result.supermemo?.status === "intr" &&
        "waitUntil" in result.supermemo &&
        result.supermemo?.waitUntil &&
        Math.abs(result.supermemo?.waitUntil - (+Date.now() + ONE_DAY)),
    ).toBeLessThan(10);
  });
  test("supermemo learn 10 words in 10 years", async () => {
    const days = 10 * 365;
    const words = 10;

    // const days = 30;
    const start = +Date.now();
    let current = start;
    let reviews = 0;
    const workflows = new Heap<{
      id: number;
      next: number;
      workflow: ReturnType<typeof learningWorkflow>;
    }>((a, b) => a.next - b.next);
    workflows.init(
      _.range(words).map((id) => ({
        id,
        workflow: learningWorkflow(),
        next: start,
      })),
    );
    const now = () => current;
    while (true) {
      const e = workflows.pop()!;
      let { next } = e;
      const { workflow, id } = e;
      current = next;
      if (current - start > days * ONE_DAY) {
        workflows.push(e);
        break;
      }
      let res = await workflow.run([], { now });

      const grade = Math.round(
        // Math.random() * ((current - start) / ONE_DAY / days) * 5,
        (1 - Math.random() / (reviews / 2 + 1)) * 5,
      );
      if (
        res.supermemo?.status === "intr" &&
        res.supermemo.step.key[1] === "review"
      ) {
        reviews += 1;
        res = await workflow.run(
          [{ k: ["supermemo", "review"], ts: current, v: grade }],
          {
            now,
          },
        );
      }
      if (
        res.supermemo?.status === "intr" &&
        "waitUntil" in res.supermemo &&
        res.supermemo.waitUntil
      ) {
        next = res.supermemo.waitUntil;
        workflows.push({ next, workflow, id });
      }
    }
    expect(workflows.length).toBe(words);
    expect(reviews).toBeLessThanOrEqual(words * (1 + days));
  });
  test("spawn", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1", schema: t.Number() }, () => 10)
      .addNode(
        {
          key: "node2",
          deps: ["node1"],
          schema: t.Number(),
        },
        ({ get }) => get("node1") * 2,
        (ctx) => {
          const schema = t.Number();
          const stepResult = ctx.step({
            key: "addition",
            description: "Enter a number for addition",
            schema: schema,
          });
          return ["cont", parse(t.Number(), stepResult) + ctx.get("node1") * 2];
        },
      )
      .build();

    const result = await workflow.run();
    expect(result.node2?.status).toBe("intr");
    if (result.node2?.status === "intr") {
      expect(result.node2?.value).toBe(20);
    }
    const result2 = await workflow.run([
      { k: ["node2", "addition"], ts: Date.now(), v: 5 },
    ]);
    expect(result2.node2?.status).toBe("intr");
    if (result2.node2?.status === "intr") {
      expect(result2.node2?.value).toBe(25);
    }
    const spawn = workflow.spawn();
    const result3 = await spawn.run([]);
    expect(result3.node2?.status).toBe("intr");
    if (result3.node2?.status === "intr") {
      expect(result3.node2?.value).toBe(20);
    }
  });
  test("fork", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1", schema: t.Number() }, () => 10)
      .addNode(
        { key: "node2", deps: ["node1"], schema: t.Number() },
        ({ get }) => get("node1") * 2,
        (ctx) => {
          const schema = t.Number();
          const stepResult = ctx.step({
            key: "addition",
            description: "Enter a number for addition",
            schema: schema,
          });
          return ["cont", parse(t.Number(), stepResult) + ctx.get("node1") * 2];
        },
      )
      .build();

    const result = await workflow.run();
    expect(result.node2?.status).toBe("intr");
    if (result.node2?.status === "intr") {
      expect(result.node2?.value).toBe(20);
    }
    const result2 = await workflow.run([
      { k: ["node2", "addition"], ts: Date.now(), v: 5 },
    ]);
    expect(result2.node2?.status).toBe("intr");
    if (result2.node2?.status === "intr") {
      expect(result2.node2?.value).toBe(25);
    }
    const fork = workflow.fork();
    const result3 = await fork.run([]);
    expect(result3.node2?.status).toBe("intr");
    if (result3.node2?.status === "intr") {
      expect(result3.node2?.value).toBe(25);
    }
  });
  test("should should tell which events are consumed and ignore irrelavent events", async () => {
    const schema = t.Object({
      firstNumber: t.Number({ description: "First number" }),
      secondNumber: t.Number({ description: "Second number" }),
    });

    const workflow = WorkflowBuilder.create()
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

    const res = await workflow.dryRun([
      {
        k: ["sum", "numbers"],
        v: { firstNumber: 3, secondNumber: 4 },
        ts: Date.now(),
      },
      {
        k: ["other", "numbers"],
        v: { firstNumber: 3, secondNumber: 4 },
        ts: Date.now(),
      },
      {
        k: ["input", "numbers"],
        v: { firstNumber: 3, secondNumber: 4 },
        ts: Date.now(),
      },
      {
        k: ["input", "numbers"],
        v: { firstNumber: 2, secondNumber: 3 },
        ts: Date.now(),
      },
    ]);
    // console.log(res);
    expect(res.newEvents).toHaveLength(2);
    expect(res.values.sum?.status === "done" && res.values.sum.value).toBe(5);
    expect(res.newEvents.map((e) => [e.v, e.s])).toMatchSnapshot();
  });
});
