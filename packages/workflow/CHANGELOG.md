# Changelog

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
