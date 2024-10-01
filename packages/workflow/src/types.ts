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
   * @param name - The name of the step.
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
   *     return step('getUserInfo', schema);
   *   })
   *   .build();
   * // This node's compute function uses step to request user input
   * ```
   */
  step<T>(name: string, schema: object): T;

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
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'delayedGreeting' }, ({ sleep }) => {
   *     sleep(2000); // Pause for 2 seconds
   *     return 'Hello after a short delay!';
   *   })
   *   .build();
   * // This node's compute function uses sleep to introduce a delay
   * ```
   */
  sleep(ms: number): void;

  /**
   * Captures the execution of a function, ensuring idempotency and encapsulating side effects within the workflow.
   * This method allows for safe retries and consistent results across multiple executions.
   *
   * @param name - The name of the capture operation, used for identifying and potentially replaying the operation.
   * @param fn - The function to be executed and captured, typically containing side effects or external interactions.
   * @returns The result of the executed function, cached for subsequent calls with the same name.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'userData' }, ({ capture }) => {
   *     return capture('fetchUserData', async () => {
   *       const response = await fetch('https://api.example.com/user');
   *       return response.json();
   *     });
   *   })
   *   .build();
   * // This node's compute function uses capture to safely fetch and cache user data
   * ```
   */
  capture: <T>(name: string, fn: () => T | Promise<T>) => T;

  /**
   * Pauses the execution of the current node until the specified datetime.
   *
   * @param datetime - The timestamp (in milliseconds) to wait until.
   *
   * @example
   * ```typescript
   * const workflow = WorkflowBuilder.create()
   *   .addNode({ key: 'scheduledTask' }, ({ now, waitUntil }) => {
   *     const futureTime = now() + 5000; // 5 seconds from now
   *     waitUntil(futureTime);
   *     return 'Task executed at the scheduled time';
   *   })
   *   .build();
   * // This node's compute function uses waitUntil to schedule a task
   * ```
   */
  waitUntil(datetime: number): void;

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
export type DAGNode<V, D extends string, G extends string = string> = {
  value: V;
  compute: (context: WorkflowContext) => V;
  dependencies: D[];
  group?: G;
  saga?: (context: WorkflowContext, value: V) => ["cont" | "halt", V];
};
