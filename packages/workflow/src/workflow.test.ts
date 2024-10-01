import { Heap } from "heap-js";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { WorkflowBuilder } from "./workflow-builder";
import { sleep } from "./utils";
import _ from "lodash";

describe("Workflow", () => {
  test("basic usage", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "a", deps: [] }, () => 1)
      .addNode({ key: "b", deps: ["a"] }, ({ get }) => `hello ${get("a")}`)
      .addNode({ key: "c", deps: ["a"] }, ({ get }) => get("a") > 0)
      .addNode({ key: "d", deps: ["b", "c"] }, ({ get }) => ({
        value: get("b").length,
        flag: get("c"),
      }))
      .build();

    // TypeScript infers the correct types
    // console.log(workflow.execute({}));

    expect(workflow.topologicalSort()).toMatchSnapshot();
    expect(workflow.getDependencies("d")).toMatchSnapshot();
    expect(await workflow.run({})).toMatchSnapshot();
  });
  test("basic step", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "a", deps: [] }, () => 1)
      .addNode({ key: "b", deps: ["a"] }, ({ get }) => `hello ${get("a")}`)
      .addNode({ key: "c", deps: ["a"] }, ({ get, step }) => {
        const schema = z.object({ x: z.number().describe("sweet number") });
        const { x } = schema.parse(
          step("need_number", zodToJsonSchema(schema)),
        );
        return get("a") + x > 0;
      })
      .addNode({ key: "d", deps: ["b", "c"] }, ({ get }) => ({
        value: get("b").length,
        flag: get("c"),
      }))
      .build();

    // TypeScript infers the correct types
    // console.log(workflow.execute({}));

    expect(workflow.topologicalSort()).toMatchSnapshot();
    expect(workflow.getDependencies("d")).toMatchSnapshot();
    const exec1 = await workflow.dryRun({});
    expect(exec1.results).toMatchSnapshot();
    expect(exec1.results["c"]?.type).toBe("intr");
    expect(exec1.results["d"]?.type).toBe("pending");

    const exec2 = await workflow.dryRun({
      c: [{ k: "need_number", v: { x: 2 } }],
    });
    expect(exec2.results).toMatchSnapshot();
    expect(exec2.results["c"]?.type).toBe("ok");

    const exec3 = await workflow.dryRun({
      c: [{ k: "need_number", v: { y: 2 } }],
    });
    expect(exec3.results).toMatchSnapshot();
    expect(exec3.results["c"]?.type).toBe("err");
  });
  test("simple group", async () => {
    const workflow = WorkflowBuilder.create()
      .addGroup("groupA")
      .addNode({ key: "node1", group: "groupA" }, () => 1)
      .addGroup("groupB")
      .addNode(
        { key: "node2", group: "groupB", deps: ["node1"] },
        ({ get }) => get("node1") + 1,
      )
      .addNode({ key: "node3", deps: ["node2"] }, ({ get }) => get("node2") * 2)
      .build();
    await workflow.run({});
  });
  test("waitUntil", async () => {
    const until = Date.now() + 10;
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1" }, ({ waitUntil }) => {
        waitUntil(until);
        return 1;
      })
      .build();
    const res1 = await workflow.dryRun({});
    expect(res1.results.node1?.type).toBe("intr");
    await sleep(20);
    const res2 = await workflow.dryRun({});
    expect(res2.results.node1?.type).toBe("ok");
  });
  test("sleep", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1" }, (ctx) => {
        ctx.sleep(10);
        return 1;
      })
      .build();
    const res1 = await workflow.run();
    expect(res1.node1?.type).toBe("intr");
    await sleep(20);
    const res2 = await workflow.run();
    expect(res2.node1?.type).toBe("ok");
  });
  test("async capture", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1" }, (ctx) =>
        ctx.capture("noop", async () => {
          await sleep(10);
          return 1;
        }),
      )
      .build();
    const res2 = await workflow.run();
    expect(res2.node1?.type).toBe("ok");
  });
  test("async capture that throws", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1" }, (ctx) =>
        ctx.capture("noop", async () => {
          throw new Error("oops");
        }),
      )
      .build();
    const res2 = await workflow.run();
    expect(res2.node1?.type).toBe("err");
  });

  test("random function", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "randomValue" }, ({ random }) => random())
      .build();

    const result1 = await workflow.run();
    expect(result1.randomValue?.type).toBe("ok");
    if (result1.randomValue?.type === "ok") {
      expect(typeof result1.randomValue?.value).toBe("number");
      expect(result1.randomValue?.value).toBeGreaterThanOrEqual(0);
      expect(result1.randomValue?.value).toBeLessThan(1);

      const result2 = await workflow.run();
      expect(result2.randomValue?.type).toBe("ok");
      if (result2.randomValue?.type === "ok") {
        expect(result2.randomValue?.value).toBe(result1.randomValue?.value);
      }
    }
  });

  test("check step name", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1" }, (ctx): number => ctx.capture("noop", () => 1))
      .build();
    const res = (await workflow.dryRun({ node1: [{ k: "nap", v: 2 }] })).results
      .node1;

    expect(res?.type).toBe("err");
  });
});

describe("saga function", () => {
  test("finite without intr", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode({ key: "node1" }, () => 5)
      .addNode(
        { key: "node2", deps: ["node1"] },
        ({ get }) => get("node1") * 2,
        (ctx, value) => (value > 15 ? ["halt", value] : ["cont", value + 1]),
      )
      .build();

    const result1 = await workflow.run();
    expect(result1.node2?.type).toBe("ok");
    if (result1.node2?.type === "ok") {
      expect(result1.node2.value).toBe(16);
    }
  });

  test("infinite", async () => {
    const workflow2 = WorkflowBuilder.create()
      .addNode({ key: "node1" }, () => 10)
      .addNode(
        { key: "node2", deps: ["node1"] },
        ({ get }) => get("node1") * 2,
        (ctx) => {
          const schema = z.number();
          return [
            "cont",
            schema.parse(ctx.step("addition", zodToJsonSchema(schema))) +
              ctx.get("node1") * 2,
          ];
        },
      )
      .build();

    const result = await workflow2.run();
    expect(result.node2?.type).toBe("intr");
    if (result.node2?.type === "intr") {
      expect(result.node2?.value).toBe(20);
    }
    const result2 = await workflow2.run({
      node2: [{ k: "addition", v: 5 }],
    });
    expect(result2.node2?.type).toBe("intr");
    if (result2.node2?.type === "intr") {
      expect(result2.node2?.value).toBe(25);
    }
  });

  test("depends on a saga with intr", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode(
        { key: "node1" },
        (): number => 5,
        (ctx, value) => {
          const schema = z.number();
          return [
            "cont",
            schema.parse(ctx.step("addition", zodToJsonSchema(schema))) + value,
          ];
        },
      )
      .addNode({ key: "node2", deps: ["node1"] }, ({ get }) => get("node1") * 2)
      .build();

    const result1 = await workflow.run();
    expect(result1.node1?.type).toBe("intr");
    expect(result1.node2?.type).toBe("ok");
    expect(result1.node1?.type === "intr" && result1.node1.value).toBe(5);
    expect(result1.node2?.type === "ok" && result1.node2.value).toBe(10);

    const result2 = await workflow.run({
      node1: [{ k: "addition", v: 3 }],
    });
    expect(result2.node1?.type).toBe("intr");
    expect(result2.node2?.type).toBe("ok");
    expect(result2.node1?.type).toBe("intr");
    expect(result2.node2?.type).toBe("ok");
    expect(result2.node1?.type === "intr" && result2.node1.value).toBe(8);
    expect(result2.node2?.type === "ok" && result2.node2.value).toBe(16);
  });
  test("saga without intr should timeout", async () => {
    const workflow = WorkflowBuilder.create()
      .addNode(
        { key: "node1" },
        (): number => 0,
        (ctx, value) => ["cont", value + 1],
      )
      .build();

    try {
      await workflow.run({}, { timeout: 100 });
    } catch (e) {
      if  (e instanceof Error) { expect(e.message).toBe("Timeout"); }
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

    const gradeSchema = z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]);
    return WorkflowBuilder.create()
      .addNode(
        { key: "supermemo" },
        (): SuperMemoItem => ({
          interval: 0,
          repetition: 0,
          efactor: 2.5,
        }),
        (ctx, item) => {
          const reviewResult = ctx.step("review", zodToJsonSchema(gradeSchema));
          const grade = gradeSchema.parse(reviewResult);
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
    const result = await workflow.run({ supermemo: [{ k: "review", v: 5 }] });
    expect(result.supermemo?.type).toBe("intr");
    expect(
      result.supermemo?.type === "intr" &&
        "waitUntil" in result.supermemo &&
        result.supermemo?.waitUntil &&
        Math.abs(result.supermemo?.waitUntil - (+Date.now() + ONE_DAY)),
    ).toBeLessThan(10);
  });
  test("supermemo learn 100 words in 10 years", async () => {
    // const words = 1000;
    const days = 10 * 365;
    const words = 100;
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
      let res = await workflow.run({}, { now });

      const grade = Math.round(
        // Math.random() * ((current - start) / ONE_DAY / days) * 5,
        (1 - Math.random() / (reviews / 2 + 1)) * 5,
      );
      if (res.supermemo?.type === "intr" && res.supermemo.step === "review") {
        reviews += 1;
        res = await workflow.run(
          { supermemo: [{ k: "review", v: grade }] },
          { now },
        );
      }
      if (
        res.supermemo?.type === "intr" &&
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
});
