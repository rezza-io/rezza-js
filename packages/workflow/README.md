# @rezza.io/workflow

## Gettings Started

### Install

With NPM

```bash
npx jsr add @rezza/workflow
```

With bun

```bash
bunx jsr add @rezza/workflow
```

### Create a workflow

```ts
import { WorkflowBuilder } from "@rezza/workflow";

const workflow = WorkflowBuilder.create()
  .addGroup("input")
  .addNode({ key: "name", group: "input" }, () => "World")
  .addNode({ key: "greeting", deps: ["name"] }, ({ get }) => `Hello, ${get("name")}!`)
  .build();

const result = await workflow.run();
console.log(result.greeting); // Output: "Hello, World!"
```
