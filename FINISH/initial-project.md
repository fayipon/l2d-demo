# Initial Project Plan

## Goal
Create an initial PixiJS + React + SPA router project baseline in this repository.

## Scope
- Scaffold React + TypeScript app with Vite
- Install and configure router and PixiJS
- Add minimal route structure
- Add a minimal Pixi host page/component
- Verify dev and build scripts run

## Planned Steps
1. Scaffold project in current directory:
   - npm create vite@latest . -- --template react-ts
2. Install required dependencies:
   - npm install react-router-dom pixi.js
3. Create baseline structure:
   - src/routes
   - src/pages
   - src/pixi
4. Configure SPA routing:
   - Add router entry with at least two routes
   - Home route and Pixi demo route
5. Add minimal Pixi integration:
   - One React component hosting a Pixi Application via ref + effect lifecycle
   - Cleanup on unmount
6. Validate:
   - npm run build
   - Ensure app can run with npm run dev

## Output
- Runnable initial project with routing and a basic Pixi demo page
- Clean, minimal baseline for further feature development

## Notes
- Follow repository workflow: execute only after explicit user start command.
