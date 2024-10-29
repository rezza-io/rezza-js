import _ from "lodash";
import isEqual from "lodash-es/isEqual";
import { NowSchema, RandomSchema, WaitSchema } from "./schemas";
import type {
  DAGNode,
  FullStepContext,
  StepContext,
  Warning,
  WorkflowContext,
} from "./types";
import { sleep } from "./utils";

export interface RunOptions {
  timeout?: number;
  now?: () => number;
}

class InputInterrupt extends Error {
  constructor(
    public step: FullStepContext,
    public waitUntil?: number,
  ) {
    super(`Interrupt at ${step}`); // (1)
  }
}

class PromiseInterrupt extends Error {
  constructor(
    public step: string,
    public promise: Promise<unknown>,
    public context: StepContext,
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
 /**
  * Represents an event that occurred during a workflow step.
  * This type is used to capture and store information about specific actions or data
  * produced during the execution of a workflow node.
  */
export type StepEventWithContext = {
  /** The key or name of the event, represented as an array of strings. */
  k: string[];
  /** The value associated with the event, which can be of any type. */
  v: unknown;
  /** The timestamp of when the event occurred, represented as a number (milliseconds since epoch). */
  ts: number;
  /** Optional context object containing metadata about the step being executed */
  c: StepContext;
  /** The input keys associated with the step, represented as an array of arrays of strings. */
  i?: string[][];
};

export type StepEvent = Omit<StepEventWithContext, "c">;

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
  | { status: "pending"; nodes: Node[] }
  | { status: "done"; value: T }
  | { status: "err"; error: Error }
  | ({ status: "intr"; step: FullStepContext; value?: T; eventIdx?: number } & (
      | InterruptedUntil
      | InterruptedValue
      | (InterruptedUntil &
          InterruptedValue) // timeout
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
  T extends Record<string, DAGNode<unknown, string>>,
  G extends string = string,
> implements WorkflowContext<T>
{
  private events: { [K in keyof T]?: StepEvent[] } = {};
  private snapshots: { [K in keyof T]?: [number, T[K]["value"]] } = {};

  private tempResults: { [K in keyof T]?: Result<T[K]["value"]> } | null = null;
  private tempNewEvents: { [K in keyof T]?: StepEventWithContext[] } | null =
    null;
  private newConsumedEvents: StepEventWithContext[] | null = null;
  private tempRunOpts: RunOptions | null = null;
  private tempWarnings: Warning[] | null = null;

  private currentNode: keyof T | null = null;
  private currentKeys: string[] = [];

  constructor(
    private nodes: T,
    private groups: Set<G>,
  ) {}

  get = <K extends string>(key: K): T[K]["value"] => {
    const result = this.tempResults?.[key];
    return result?.status === "done"
      ? result.value
      : result?.status === "intr"
        ? result.value
        : undefined;
  };

  step = <T>(context: StepContext): T => {
    throw new InputInterrupt({
      ...context,
      key: [...this.currentKeys, context.key],
    });
  };

  addTempEvent = (
    key: string,
    newEvent: unknown,
    context: StepContext<unknown>,
  ): void => {
    const event: StepEventWithContext = {
      k: [...this.currentKeys, key],
      v: newEvent,
      c: context,
      ts: this.getNow(),
    };
    this.tempNewEvents![this.currentNode!] ||= [];
    this.tempNewEvents![this.currentNode!]!.push(event);
    this.newConsumedEvents?.push(event);
  };

  capture = <T>(context: StepContext, fn: () => T | Promise<T>): T => {
    const stepKey = `capture:${context.key}`;
    try {
      return this.step<T>({ ...context, key: stepKey });
    } catch (e) {
      if (e instanceof InputInterrupt) {
        const newEvent = fn();
        if (newEvent instanceof Promise) {
          throw new PromiseInterrupt(stepKey, newEvent, context);
        }
        this.addTempEvent(stepKey, newEvent, context);
        return newEvent;
      }
      throw e;
    }
  };

  getNow = (): number =>
    this.tempRunOpts?.now ? this.tempRunOpts.now() : Date.now();
  now = (): number =>
    this.capture({ key: "now", schema: NowSchema }, this.getNow);

  sleep = (ms: number, context?: Partial<StepContext>): void => {
    this.waitUntil(this.now() + ms, { key: "sleep", ...context });
  };

  waitUntil = (datetime: number, context?: Partial<StepContext>): void => {
    if (this.getNow() < datetime)
      throw new InputInterrupt(
        {
          schema: WaitSchema,
          ...context,
          key: [...this.currentKeys, "waitUntil"],
        },
        datetime,
      );
  };

  random = (): number => {
    return this.capture({ key: "random", schema: RandomSchema }, Math.random);
  };

  private async executeNode<K extends keyof T>(
    key: K,
    events: StepEvent[],
  ): Promise<Result<T[K]["value"]>> {
    const node = this.nodes[key];

    const pending = this.nodes[key].dependencies.filter((n) => {
      const result = this.tempResults?.[n];
      return !(
        result?.status === "done" ||
        (result?.status === "intr" && result.value !== undefined)
      );
    });

    if (pending.length > 0) {
      return { status: "pending", nodes: pending };
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
      this.step = <T>(context: StepContext): T => {
        if (idx < allEvents?.length) {
          const event = allEvents[idx++];
          const fullKey = [...this.currentKeys, context.key];
          this.newConsumedEvents?.push({
            ...event,
            c: context,
          });
          if (isEqual(event.k, fullKey)) {
            const eventInputKeys = event.i;
            const currentInputKeys = context.inputs?.map((i) => i.key);

            if (!_.isEqual(eventInputKeys, currentInputKeys)) {
              this.tempWarnings?.push({
                type: "context_updated",
                step: fullKey,
                old: event.i,
                new: currentInputKeys,
              });
            }

            return event.v as T;
          }
          throw new Error(
            `Expected event ${fullKey} but got ${event.k} instead`,
          );
        }
        throw new InputInterrupt({
          ...context,
          key: [...this.currentKeys, context.key],
        });
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
            if (this.tempRunOpts?.timeout) await sleep(0);
            value = newValue;
            if (action === "halt") {
              break;
            }
          }
        }

        return { status: "done", value: value };
      } catch (error) {
        if (error instanceof PromiseInterrupt) {
          try {
            const newEvent = await error.promise;
            promiseCount += 1;
            this.addTempEvent(error.step, newEvent, error.context);
          } catch (error) {
            if (error instanceof Error) {
              // console.log(error);
              return { status: "err", error };
            }
            return { status: "err", error: new Error("Unknown") };
          }
        } else if (error instanceof InputInterrupt) {
          return {
            status: "intr",
            step: error.step,
            ...(error.waitUntil ? { waitUntil: error.waitUntil } : {}),
            ...(value ? { value } : {}),
            ...(eventIdx ? { eventIdx } : {}),
          };
        } else {
          if (error instanceof Error) {
            return { status: "err", error };
          }
          return { status: "err", error: new Error("Unknown") };
        }
      } finally {
        this.step = originalStep;
      }
    }
    return {
      status: "err",
      error: new Error("Too many promises in a single step!"),
    };
  }

  getDependencies<K extends keyof T>(key: K): T[K]["dependencies"] {
    return this.nodes[key].dependencies;
  }

  topology(): {
    node: keyof T;
    schema: object;
    dependecies: string[];
    title?: string;
    description?: string;
    isSaga?: boolean;
  }[] {
    const visited = new Set<keyof T>();
    const result: {
      node: keyof T;
      schema: object;
      dependecies: string[];
      title?: string;
      description?: string;
      isSaga?: boolean;
    }[] = [];

    const visit = (node: keyof T) => {
      if (visited.has(node)) return;
      visited.add(node);
      for (const dep of this.nodes[node].dependencies) {
        visit(dep);
      }
      result.push({
        node,
        dependecies: this.nodes[node].dependencies,
        schema: this.nodes[node].schema,
        title: this.nodes[node].title,
        isSaga: !!this.nodes[node].saga,
        description: this.nodes[node].description,
      });
    };

    for (const node of Object.keys(this.nodes) as (keyof T)[]) {
      visit(node);
    }

    return result;
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

  executeNodes = async (incomingEvents: StepEvent[]): Promise<void> => {
    for (const node of this.topologicalSort()) {
      this.currentNode = node;
      this.currentKeys.push(node as string);
      this.tempResults![node] = await this.executeNode(
        node,
        incomingEvents.filter((e) => e.k[0] === node),
      );
      this.currentKeys.pop();
    }
  };

  async dryRun(
    incomingEvents: StepEvent[],
    opts?: RunOptions,
  ): Promise<{
    values: { [K in keyof T]?: Result<T[K]["value"]> };
    warnings?: Warning[];
    newEvents: StepEventWithContext[];
    timeout: boolean;
  }> {
    if (this.isRunning) {
      throw new Error("Workflow is already running");
    }
    this.isRunning = true;
    this.tempResults = {};
    this.tempNewEvents = {};
    this.newConsumedEvents = [];
    this.tempRunOpts = opts ?? null;
    this.tempWarnings = [];

    let timeout = false;

    const executionPromise = this.executeNodes(incomingEvents);

    if (opts?.timeout) {
      await Promise.race([
        executionPromise,
        sleep(opts?.timeout ?? 1000).then(() => {
          timeout = true;
        }),
      ]);
    } else {
      await executionPromise;
    }

    const results = this.tempResults;
    const warnings = this.tempWarnings;
    const newEvents = this.newConsumedEvents;
    this.tempWarnings = null;
    this.newConsumedEvents = null;
    this.tempRunOpts = null;
    this.tempResults = null;
    this.tempNewEvents = null;
    this.isRunning = false;
    return { values: results, newEvents, timeout, warnings };
  }

  async run(
    incomingEvents?: StepEvent[],
    opts?: RunOptions,
  ): Promise<{ [K in keyof T]?: Result<T[K]["value"]> }> {
    const {
      newEvents,
      values: results,
      timeout,
    } = await this.dryRun(incomingEvents ?? [], opts);

    if (timeout) throw new Error("Timeout");

    this.events ||= {};
    for (const e of newEvents) {
      const node = e.k[0] as keyof T;
      this.events[node] ||= [];
      this.events[e.k[0]]!.push(e);
    }
    for (const k in results) {
      const result = results[k];
      if (result?.status === "intr" && result.eventIdx) {
        this.snapshots[k] = [result.eventIdx, result.value];
      }
    }
    return results;
  }
  spawn(): Workflow<T, G> {
    return new Workflow(this.nodes, this.groups);
  }
  fork(): Workflow<T, G> {
    const w = new Workflow(this.nodes, this.groups);
    w.events = { ...this.events };
    w.snapshots = { ...this.snapshots };
    return w;
  }
}
