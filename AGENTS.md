# Agent Instructions for l2d-demo

## Scope
These instructions apply to this repository.
Project target: PixiJS + React + SPA router.

## Repository Layout
Application source now lives under `project01/`.
Run app-related commands from `project01/`.

## Current Repository State
This repository is currently empty (only .git exists).
Before coding features, scaffold the app first.

## Preferred Bootstrap
Use a React + TypeScript baseline with Vite unless the user asks otherwise.
Recommended bootstrap command:
- npm create vite@latest . -- --template react-ts

After scaffolding:
- Install dependencies
- Verify scripts in package.json
- Run the local dev server

## Command Policy
Only run scripts that actually exist in package.json.
Do not invent script names.
If a script is missing, add it only when requested or clearly required by the task.

Expected common scripts after setup:
- npm run dev
- npm run build
- npm run preview
- npm run lint
- npm run test (only if test tooling is installed)

## Architecture Conventions
Keep React UI/state and Pixi rendering logic separated.

Use this shape by default:
- project01/src/app for app shell and providers
- project01/src/routes for SPA router config
- project01/src/pages for route-level React pages
- project01/src/features for domain logic
- project01/src/pixi for Pixi app lifecycle, scenes, assets, and render systems
- project01/src/components for shared React UI components
- project01/src/lib for generic utilities
- project01/src/types for shared TypeScript types

## PixiJS + React Integration Rules
Create one Pixi Application per mounted canvas host unless a task requires otherwise.
Store Pixi instances in refs, not React state.
Create and destroy Pixi resources inside effect lifecycle boundaries.
Always clean up ticker callbacks, textures, and listeners on unmount.
Avoid re-creating display objects on every React render.

## SPA Router Rules
Keep route definitions centralized in src/routes.
Use route-level lazy loading when it reduces initial bundle size.
Do not put router side effects inside Pixi render loops.

## State and Data Flow
React state drives UI and high-level scene parameters.
Pixi runtime handles frame-by-frame rendering updates.
Bridge state to Pixi through explicit adapters/hooks, not implicit globals.

## Performance Defaults
Prefer texture reuse and object pooling in animation-heavy scenes.
Throttle or debounce expensive resize/layout handlers.
Profile frame time before introducing premature optimizations.

## Coding Standards
Use TypeScript strict mode when available.
Prefer small, composable modules over large mixed-responsibility files.
Keep public APIs typed and stable.
Document non-obvious lifecycle constraints with short comments.

## Safety Checks Before Finishing Tasks
- Run build or type checks when available
- Run relevant tests when available
- Confirm Pixi lifecycle cleanup paths are present
- Confirm router navigation still works after changes

## Documentation Strategy
If project docs are added later, link to them from this file instead of duplicating long instructions.

## Task Workflow Protocol
For each new implementation request:
- First create a plan file in PLANS named xxxx.md.
- Do not start execution until the user explicitly says start.
- After completing execution, move the related plan file from PLANS to FINISH, then commit and push in the same flow.
- If reference material is needed, look in DESIGN first.
