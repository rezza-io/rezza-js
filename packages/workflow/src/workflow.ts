import type { DAGNode, StepContext, WorkflowContext } from "./types";
import { sleep } from "./utils";

export interface RunOptions {
  timeout?: number;
  now?: () => number;
}

class InputInterrupt extends Error {
  constructor(
    public step: StepContext,
    public schema?: object,
    public waitUntil?: number,
  ) {
    super(`Interrupt at ${step}`); // (1)
  }
}
class PromiseInterrupt extends Error {
  constructor(
    public step: string,
    public promise: Promise<unknown>,
  ) {
    super(`Interrupt at ${step}`); // (1)
  }
}

/**
 * Represents an interruption in the workflow execution due to a time-based condition.
 * This type is used when a node is waiting for a specific time to be reached before continuing.
 */
export type InterruptedUntil = { waitUntil?: number };
/**
 * Represents an interruption in the workflow execution due to a required user input.
 * This type is used when a node is waiting for user input that conforms to a specific JSON schema.
 */
export type InterruptedValue = {
  /* The JSON schema describing the expected input structure. */
  schema: object;
};

/**
 * Represents an event that occurred during a workflow step.
 * This type is used to capture and store information about specific actions or data
 * produced during the execution of a workflow node.
 */
export type StepEvent = {
  /* The key or name of the event. */
  k: string;
  /* The value associated with the event, which can be of any type. */
  v: unknown;
};

/**
 * Represents the result of a workflow node execution.
 * This type is used to indicate the current state of a node's execution,
 * which can be pending, successful, erroneous, or interrupted.
 *
 * @typeParam T - The type of the value produced by the node.
 * @typeParam Node - The type of the node identifier (defaults to string).
 *
 * The Result type can be one of the following:
 * - pending: Indicates that the node is waiting for its dependencies to complete.
 * - ok: Indicates that the node has successfully completed execution.
 * - err: Indicates that an error occurred during the node's execution.
 * - intr: Indicates that the node's execution was interrupted, possibly due to
 *         a time-based condition or a need for additional input.
 */
export type Result<T, Node extends string = string> =
  | { type: "pending"; nodes: Node[] }
  | { type: "ok"; value: T }
  | { type: "err"; error: Error }
  | ({ type: "intr"; step: StepContext; value?: T; eventIdx?: number } & (
      | InterruptedUntil
      | InterruptedValue
      | (InterruptedUntil & InterruptedValue) // timeout
    ));

/**
 * Represents a workflow that can execute a directed acyclic graph (DAG) of nodes.
 * Each node in the workflow can compute a value and depend on other nodes.
 *
 * @typeParam T - A record type where keys are node names and values are DAGNode types.
 * @typeParam G - A string type representing the group names in the workflow.
 *
 * The Workflow class provides methods to:
 * - Execute nodes in topological order
 * - Handle dependencies between nodes
 * - Manage interruptions and resumptions in node execution
 * - Capture and replay events for idempotency
 * - Perform dry runs and actual runs of the workflow
 *
 * It implements the WorkflowContext interface, providing utility methods
 * that can be used within node computations, such as `get`, `step`, `capture`,
 * `now`, `sleep`, `waitUntil`, and `random`.
 */
export class Workflow<
  T extends Record<string, DAGNode<unknown, string>> = Record<never, unknown>,
  G extends string = string,
> implements WorkflowContext<T>
{
  private events: { [K in keyof T]?: StepEvent[] } = {};
  private snapshots: { [K in keyof T]?: [number, T[K]["value"]] } = {};

  private tempResults: { [K in keyof T]?: Result<T[K]["value"]> } | null = null;
  private tempNewEvents: { [K in keyof T]?: StepEvent[] } | null = null;
  private tempRunOpts: RunOptions | null = null;

  private currentNode: keyof T | null = null;

  constructor(
    private nodes: T,
    private groups: Set<G>,
  ) {}

  get = <K extends string>(key: K): T[K]["value"] => {
    const result = this.tempResults?.[key];
    return result?.type === "ok"
      ? result.value
      : result?.type === "intr"
        ? result.value
        : undefined;
  };
  step = <T>(context: StepContext, schema: object): T => {
    throw new InputInterrupt(context, schema);
  };

  addTempEvent = (name: string, newEvent: unknown): void => {
    // console.log("addTempNewEvent", newEvent);
    this.tempNewEvents![this.currentNode!] ||= [];
    this.tempNewEvents![this.currentNode!]!.push({ k: name, v: newEvent });
  };

  capture = <T>(context: StepContext, fn: () => T | Promise<T>): T => {
    const stepKey = `capture:${context.key}`;
    try {
      return this.step<T>({ key: stepKey }, { schema: {} });
    } catch (e) {
      if (e instanceof InputInterrupt) {
        const newEvent = fn();
        if (newEvent instanceof Promise) {
          throw new PromiseInterrupt(stepKey, newEvent);
        }
        this.addTempEvent(stepKey, newEvent);
        return newEvent;
      }
      throw e;
    }
  };

  getNow = (): number =>
    this.tempRunOpts?.now ? this.tempRunOpts.now() : +new Date();
  now = (): number => this.capture({ key: "now" }, this.getNow);

  sleep = (ms: number, context?: Partial<StepContext>): void => {
    this.waitUntil(this.now() + ms, { key: "sleep", ...context });
  };

  waitUntil = (datetime: number, context?: Partial<StepContext>): void => {
    if (this.getNow() < datetime)
      throw new InputInterrupt(
        { key: "waitUntil", ...context },
        undefined,
        datetime,
      );
  };

  random = (): number => {
    return this.capture({ key: "random" }, Math.random);
  };

  private async executeNode<K extends keyof T>(
    key: K,
    events: StepEvent[],
  ): Promise<Result<T[K]["value"]>> {
    const node = this.nodes[key];

    const pending = this.nodes[key].dependencies.filter((n) => {
      const result = this.tempResults?.[n];
      return !(
        result?.type === "ok" ||
        (result?.type === "intr" && result.value !== undefined)
      );
    });

    if (pending.length > 0) {
      return { type: "pending", nodes: pending };
    }

    let idx = 0;
    const originalStep = this.step;
    let promiseCount = 0;
    const MAX_PROMISES = 1000;
    while (promiseCount < MAX_PROMISES) {
      const allEvents = [
        ...(this.events[key] ?? []),
        ...events,
        ...(this.tempNewEvents?.[key] ?? []),
      ];
      this.step = <T>(context: StepContext, schema: object): T => {
        if (idx < allEvents?.length) {
          const event = allEvents[idx++];
          if (event.k === context.key) {
            return event.v as T;
          } else {
            throw new Error(
              `Expected event ${context.key} but got ${event.k} instead`,
            );
          }
        } else throw new InputInterrupt(context, schema);
      };
      let value: T[K]["value"] | undefined = undefined;
      let eventIdx = 0;
      try {
        const snapshot = this.snapshots[key];
        if (node.saga && snapshot) {
          idx = snapshot[0];
          value = snapshot[1];
        } else {
          value = await node.compute(this);
        }

        if (node.saga) {
          while (true) {
            eventIdx = idx;
            const [action, newValue] = node.saga(this, value);
            await sleep(0);
            value = newValue;
            if (action === "halt") {
              break;
            }
          }
        }

        return { type: "ok", value: value };
      } catch (error) {
        if (error instanceof PromiseInterrupt) {
          try {
            const newEvent = await error.promise;
            promiseCount += 1;
            this.addTempEvent(error.step, newEvent);
          } catch (error) {
            if (error instanceof Error) {
              return { type: "err", error };
            }
            return { type: "err", error: new Error("Unknown") };
          }
        } else if (error instanceof InputInterrupt) {
          return {
            type: "intr",
            step: error.step,
            schema: error.schema,
            ...(error.waitUntil ? { waitUntil: error.waitUntil } : {}),
            ...(value ? { value } : {}),
            ...(eventIdx ? { eventIdx } : {}),
          };
        } else {
          if (error instanceof Error) {
            return { type: "err", error };
          }
          return { type: "err", error: new Error("Unknown") };
        }
      } finally {
        this.step = originalStep;
      }
    }
    return {
      type: "err",
      error: new Error("Too many promises in a single step!"),
    };
  }

  getDependencies<K extends keyof T>(key: K): T[K]["dependencies"] {
    return this.nodes[key].dependencies;
  }

  topologicalSort(): (keyof T)[] {
    const visited = new Set<keyof T>();
    const result: (keyof T)[] = [];

    const visit = (node: keyof T) => {
      if (visited.has(node)) return;
      visited.add(node);
      for (const dep of this.nodes[node].dependencies) {
        visit(dep);
      }
      result.push(node);
    };

    for (const node of Object.keys(this.nodes) as (keyof T)[]) {
      visit(node);
    }

    return result;
  }
  isRunning = false;

  executeNodes = async (incomingEvents: {
    [K in keyof T]?: StepEvent[];
  }): Promise<void> => {
    for (const node of this.topologicalSort()) {
      this.currentNode = node;
      this.tempResults![node] = await this.executeNode(
        node,
        incomingEvents[node] ?? [],
      );
    }
  };

  async dryRun(
    incomingEvents: { [K in keyof T]?: StepEvent[] },
    opts?: RunOptions,
  ): Promise<{
    results: { [K in keyof T]?: Result<T[K]["value"]> };
    newEvents: { [K in keyof T]?: StepEvent[] };
    timeout: boolean;
  }> {
    if (this.isRunning) {
      throw new Error("Workflow is already running");
    }
    this.isRunning = true;
    this.tempResults = {};
    this.tempNewEvents = {};
    this.tempRunOpts = opts ?? null;

    let timeout = false;

    await Promise.race([
      this.executeNodes(incomingEvents),
      sleep(opts?.timeout ?? 1000).then(() => {
        timeout = true;
      }),
    ]);

    const results = this.tempResults;
    const newEvents = this.tempNewEvents;
    this.tempRunOpts = null;
    this.tempResults = null;
    this.tempNewEvents = null;
    this.isRunning = false;
    return { results, newEvents, timeout };
  }

  async run(
    incomingEvents?: { [K in keyof T]?: StepEvent[] },
    opts?: RunOptions,
  ): Promise<{ [K in keyof T]?: Result<T[K]["value"]> }> {
    const { newEvents, results, timeout } = await this.dryRun(
      incomingEvents ?? {},
      opts,
    );

    if (timeout) throw new Error("Timeout");

    this.events ||= {};
    for (const k in incomingEvents) {
      this.events[k] = [
        ...(this.events[k] ?? []),
        ...(incomingEvents[k] ?? []),
      ];
    }
    for (const k in newEvents) {
      this.events[k] = [...(this.events[k] ?? []), ...(newEvents[k] ?? [])];
    }
    for (const k in results) {
      const result = results[k];
      if (result?.type === "intr" && result.eventIdx) {
        this.snapshots[k] = [result.eventIdx, result.value];
      }
    }
    return results;
  }
}
