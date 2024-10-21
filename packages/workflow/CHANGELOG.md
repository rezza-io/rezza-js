# Changelog

## [0.3.1] - 2024-10-22

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
