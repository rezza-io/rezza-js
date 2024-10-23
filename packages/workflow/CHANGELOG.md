# Changelog

## [0.4.4] - 2024-10-23

### Added
- Introduced `title` field to `FullStepContext` and `StepContext` interfaces for better step documentation
- Added `title` field to the `need_number` step in the workflow test

### Changed
- Updated comments in `types.ts` to use single-line comment style for consistency
- Clarified the purpose of the `schema` field in `FullStepContext` and `StepContext`

### Developer Experience
- Bumped version to 0.4.4 in both `jsr.json` and `package.json`


# Changelog

## [0.4.3] - 2024-10-23

### Added
- Introduced `title` and `description` fields to `DAGNode` type for better node documentation
- Added `isSaga` flag to the topology output for identifying saga nodes

### Changed
- Updated `WorkflowBuilder.addNode` to accept `title` and `description` in node configuration
- Modified `Workflow.topology()` to include `title`, `description`, and `isSaga` in the output

### Developer Experience
- Added `test:dev` script in `package.json` for running tests in watch mode
- Updated test snapshots to reflect new topology output format


# Changelog

## [0.4.2] - 2024-10-22

### Added
- Exported `DoneSchema` and `DONE` constant from `schemas.ts`
- Introduced `DONE` constant as a typed alternative to the string literal "done"

### Changed
- Updated `sleep.ts` example to use `DoneSchema` and `DONE` constant
- Refactored `sum.ts` example for better readability and type safety
- Modified schema exports in `index.ts` to use `export *` instead of `export * as schemas`
- Updated `DoneSchema` definition to use `as const` for improved type inference

### Fixed
- Improved type safety in `sleep.ts` and `sum.ts` examples

### Developer Experience
- Bumped version to 0.4.2 in both `jsr.json` and `package.json`


## [0.4.1] - 2024-10-21

### Added
- Introduced `StepEventWithSchema` type for improved event handling
- Added `newConsumedEvents` to track consumed events during workflow execution
- Created a new `sum.ts` example in the `examples` directory

### Changed
- Updated `Workflow.dryRun` to return consumed events instead of all new events
- Modified `Workflow.addTempEvent` to include schema information
- Refactored `Workflow.step` to use `StepEventWithSchema`
- Updated `PromiseInterrupt` to include schema information

### Fixed
- Improved event consumption logic to ignore irrelevant events
- Enhanced type safety for `StepContext` using generic type parameter

### Developer Experience
- Added new test case for event consumption in `workflow.test.ts`
- Updated snapshots to reflect changes in event handling

## [0.4.0] - 2024-10-21

### Added
- Introduced `schema` field to `DAGNode` type for improved type safety
- Added `topology()` method to `Workflow` class for retrieving node topology with schemas
- Extended `WorkflowBuilder.addNode` to include `schema` in node configuration

### Changed
- Updated `InputInterrupt` to remove separate `schema` parameter

- Modified `Workflow.capture` to use `schema` from node configuration
- Refactored `Workflow.step` to align with new `InputInterrupt` structure

### Developer Experience
- Bumped version to 0.4.0 in both `jsr.json` and `package.json`


## [0.3.2] - 2024-10-21

### Added
- Exported `FormatRegistry` from TypeBox for advanced type customization

### Changed
- Updated peer dependencies to include TypeBox with version >=0.33.0

### Fixed
- Corrected TypeBox import path in the main index file


## [0.3.1] - 2024-10-21

### Changed
- Updated TypeBox import to use the more specific path `@sinclair/typebox/type` for better tree-shaking.


## [0.3.0] - 2024-10-21

### Added
- Introduced TypeBox for schema validation, replacing Zod
- Added `RandomSchema` and `NowSchema` for improved type safety
- Exported `Type` as `t` and `Parse` as `parse` from TypeBox for easier usage
- Created a new `schemas.ts` file to centralize schema definitions

### Changed
- Updated `WorkflowBuilder.addNode` to require a `schema` field in node configuration
- Modified `WorkflowContext.step` to use the `schema` field from `StepContext`
- Updated `Workflow.capture` to use the provided schema
- Replaced `new Date()` usage with `Date.now()` for consistency
- Updated test cases to use TypeBox schemas instead of Zod

### Removed
- Removed dependency on Zod and zod-to-json-schema

### Fixed
- Improved type safety throughout the codebase

### Developer Experience
- Updated snapshots to reflect new TypeBox schema output
- Refactored test cases for better readability and maintainability
