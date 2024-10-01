import type { DAGNode, WorkflowContext } from "./types";
import { Workflow } from "./workflow";

type NodeValue = string | number | boolean | (object & { then?: never });

/**
 * A builder class for creating workflows with typed nodes and groups.
 *
 * @example
 * ```typescript
 * const workflow = WorkflowBuilder.create()
 *   .addGroup("input")
 *   .addNode({ key: "name", group: "input" }, () => "World")
 *   .addNode({ key: "greeting", deps: ["name"] }, ({ get }) => `Hello, ${get("name")}!`)
 *   .build();
 *
 * const result = await workflow.run();
 * console.log(result.greeting); // Output: "Hello, World!"
 * ```
 */
export class WorkflowBuilder<
  T extends Record<string, DAGNode<unknown, string>> = Record<never, unknown>,
  G extends string = string,
> {
  private nodes: T = {} as T;
  private groups: Set<G> = new Set();

  /**
   * Adds a new group to the workflow.
   *
   * @param group - The name of the new group
   * @returns  A new WorkflowBuilder instance with the added group
   */
  addGroup<NewG extends string>(group: NewG): WorkflowBuilder<T, G | NewG> {
    const newGroups = new Set<G | NewG>(this.groups);
    newGroups.add(group);
    return new WorkflowBuilder<T, G | NewG>(this.nodes, newGroups);
  }
  /**
   * Adds a new node to the workflow.
   *
   * @param config - Configuration object for the new node
   * @param compute - Synchronous function to compute the node's value
   * @returns A new WorkflowBuilder instance with the added node
   */
  addNode<
    K extends string,
    V extends NodeValue,
    D extends Extract<keyof T, string>,
  >(
    config: {
      /** The key for the new node */
      key: K extends keyof T ? never : K;
      /** The group to which the node belongs (optional) */
      group?: G;
      /** Array of dependency keys (optional) */
      deps?: D[];
    },
    compute: (context: WorkflowContext<T>) => V,
    saga?: (context: WorkflowContext<T>, value: V) => ["cont" | "halt", V],
  ): WorkflowBuilder<T & Record<K, DAGNode<V, D>>, G> {
    const { key: nodeKey, group } = config;
    if (nodeKey in this.nodes) {
      throw new Error(`Node ${String(nodeKey)} already exists`);
    }

    // Check if all dependencies exist
    for (const dep of config.deps ?? []) {
      if (!(dep in this.nodes)) {
        throw new Error(`Dependency ${String(dep)} does not exist`);
      }
    }
    const newNodes = {
      ...this.nodes,
      [nodeKey]: {
        compute: compute,
        dependencies: config.deps ?? [],
        group,
        saga,
      },
    };

    // Create a new instance with the updated nodes
    return new WorkflowBuilder<T & Record<K, DAGNode<V, D, G>>, G>(
      newNodes as T & Record<K, DAGNode<V, D, G>>,
      this.groups,
    );
  }

  /**
   * Creates a new instance of WorkflowBuilder.
   *
   * @returns A new WorkflowBuilder instance
   */
  static create(): WorkflowBuilder<{}, string> {
    return new WorkflowBuilder({}, new Set<string>());
  }

  private constructor(nodes: T, groups: Set<G>) {
    this.nodes = nodes;
    this.groups = groups;
  }

  /**
   * Builds and returns a Workflow instance based on the current configuration.
   *
   * @returns  A new Workflow instance
   */
  build(): Workflow<T, G> {
    return new Workflow<T, G>(this.nodes, this.groups);
  }
}
