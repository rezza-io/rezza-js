export type Warning = {
  type: "context_updated";
  step: string[];
  old?: string[][];
  new?: string[][];
};

export type StepInput = {
  /** Optional title for the step input */
  title?: string;

  /** Optional instruction text to guide user input */
  instruction?: string;

  /** Array of strings identifying this step input. Warns if key and provided event do not match */
  key: string[];

  /** Whether this input contains personally identifiable information (PII) */
  pii?: boolean;

  action?:
    | "print"
    | "display"
    | "say"
    | "ask"
    | "write"
    | "show"
    | "read"
    | "speak"
    | "query"
    | "announce"
    | "present"
    | "narrate"
    | "request"
    | "prompt";
} & (
  | { type: null }
  | {
      /** The content value for string-based formats like HTML, Markdown or URI */
      content: string;

      /** The format/type specifying how to interpret the string content */
      type: "html" | "md" | "uri";
    }
  | {
      /** The content value for JSON data as a JavaScript object */
      content: object;

      /** Indicates this is JSON formatted data */
      type: "json";

      /** Optional JSON schema to validate the input content */
      schema?: object;
    }
);

/**
 * Represents the context for a step in the workflow.
 */
export type FullStepContext = Omit<StepContext, "key" | "schema"> & {
  /** Unique identifier for the step */
  key: string[];

  /** Schema definition for the step */
  schema: object;
};

/**
 * Represents the context for a step in the workflow.
 */
export interface StepContext<T = unknown> {
  /** Unique identifier for the step */
  key: string;

  /** Optional title of the step */
  title?: string;

  /** Optional description of the step */
  description?: string;

  /** Optional deadline for completing the step (as timestamp in milliseconds since Unix epoch) */
  deadline?: number;
  /** Additional metadata for the step as key-value pairs */
  extra?: Record<string, unknown>;

  /** Schema definition for the step with static typing */
  schema: { static: T };

  /** Array of inputs required for this step */
  inputs?: StepInput[];
}

/**
 * Represents the context available to nodes within a workflow.
 * This interface provides methods for interacting with the workflow,
 * such as retrieving node values, requesting user input, and managing
 * time-based operations.
 */
export interface WorkflowContext<
  T extends Record<string, DAGNode<unknown, string>> = Record<
    string,
    DAGNode<unknown, string>
  >,
> {
  /**
   * Retrieves the value of a node in the workflow by its key.
   *
   * @param key - The key of the node whose value to retrieve.
   * @returns The value of the specified node.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'userInfo' }, () => ({ name: 'John Doe', age: 30 }))
   *   .addNode({ key: 'greeting', deps: ['userInfo'] }, ({ get }) => {
   *     const user = get('userInfo');
   *     return `Hello, ${user.name}! You are ${user.age} years old.`;
   *   })
   *   .build();
   * // The 'greeting' node's compute function uses get to access 'userInfo'
   * ```
   */
  get<K extends string>(key: K): T[K]["value"];

  /**
   * Requests user input for a step in the workflow.
   *
   * @param context - An object containing information about the step.
   * @param schema - The JSON schema describing the expected input.
   * @returns The user input conforming to the provided schema.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'userInput' }, ({ step }) => {
   *     const schema = {
   *       type: 'object',
   *       properties: {
   *         name: { type: 'string' },
   *         age: { type: 'number' }
   *       },
   *       required: ['name', 'age']
   *     };
   *     return step({
   *       key: 'getUserInfo',
   *       description: 'Please enter your name and age',
   *       extra: { importance: 'high' }
   *     }, schema);
   *   })
   *   .build();
   * // This node's compute function uses step to request user input with additional context
   * ```
   */
  step<T>(context: StepContext): T;

  /**
   * Returns the current timestamp in milliseconds.
   *
   * @returns The current timestamp as a number.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'timestamp' }, ({ now }) => {
   *     const currentTime = now();
   *     return `Current timestamp: ${currentTime}`;
   *   })
   *   .build();
   * // This node's compute function uses now to get the current timestamp
   * ```
   */
  now(): number;

  /**
   * Pauses the execution of the current node for the specified duration.
   *
   * @param ms - The number of milliseconds to sleep.
   * @param context - Optional context information for the sleep operation.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'delayedGreeting' }, ({ sleep }) => {
   *     sleep(2000, { key: 'shortDelay', description: 'Pause for 2 seconds' });
   *     return 'Hello after a short delay!';
   *   })
   *   .build();
   * // This node's compute function uses sleep to introduce a delay with context
   * ```
   */
  sleep(ms: number, context?: Partial<StepContext>): void;

  /**
   * Captures the execution of a function, ensuring idempotency and encapsulating side effects within the workflow.
   * This method allows for safe retries and consistent results across multiple executions.
   *
   * @param context - An object containing information about the step, including a unique key for the capture operation.
   * @param fn - The function to be executed and captured, typically containing side effects or external interactions.
   * @returns The result of the executed function, cached for subsequent calls with the same key.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'userData' }, ({ capture }) => {
   *     return capture({
   *       key: 'fetchUserData',
   *       description: 'Fetch user data from API'
   *     }, async () => {
   *       const response = await fetch('https://api.example.com/user');
   *       return response.json();
   *     });
   *   })
   *   .build();
   * // This node's compute function uses capture to safely fetch and cache user data
   * ```
   */
  capture<T>(context: StepContext, fn: () => T | Promise<T>): T;

  /**
   * Pauses the execution of the current node until the specified datetime.
   *
   * @param datetime - The timestamp (in milliseconds) to wait until.
   * @param context - Optional context information for the wait operation.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'scheduledTask' }, ({ now, waitUntil }) => {
   *     const futureTime = now() + 5000; // 5 seconds from now
   *     waitUntil(futureTime, {
   *       key: 'shortWait',
   *       description: 'Wait for 5 seconds'
   *     });
   *     return 'Task executed at the scheduled time';
   *   })
   *   .build();
   * // This node's compute function uses waitUntil to schedule a task with context
   * ```
   */
  waitUntil(datetime: number, context?: Partial<StepContext>): void;

  /**
   * Generates a random number between 0 (inclusive) and 1 (exclusive).
   *
   * @returns A pseudo-random number between 0 and 1.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'randomValue' }, ({ random }) => {
   *     return random();
   *   })
   *   .build();
   * // This node's compute function uses random to generate a random number
   * ```
   */
  random(): number;
}

/**
 * Represents a node in a Directed Acyclic Graph (DAG) within the workflow.
 */
export type DAGNode<
  V,
  D extends string,
  G extends string = string,
  S extends object = object,
> = {
  /* The computed value of the node */
  value: V;
  /* Function to compute the node's value */
  compute: (context: WorkflowContext) => V;
  /* Array of keys representing the node's dependencies */
  dependencies: D[];
  /* Optional title for the node */
  title?: string;
  /* Optional description of the node's purpose or functionality */
  description?: string;
  /* Optional group to which the node belongs */
  group?: G;
  /* Optional saga function for advanced flow control */
  saga?: (context: WorkflowContext, value: V) => ["cont" | "halt", V];
  schema: S;
};
