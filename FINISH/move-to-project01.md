# Move Project Into project01 Plan

## Goal
Place the current project under a single directory named project01.

## Scope
- Create root folder project01
- Move current project files/directories into project01
- Keep .git at repository root (so git history remains intact)
- Verify project still builds from the new path
- Update any path-sensitive references if needed

## Planned Steps
1. Create project01 directory at repository root.
2. Move all project content into project01, excluding:
   - .git
   - PLANS
   - FINISH
   - DESIGN
   - AGENTS.md (optional to keep at root for repo-level agent guidance)
3. Validate moved project:
   - cd project01
   - npm run build
4. Confirm final structure is correct.
5. Commit and push after completion.
6. Move this plan from PLANS to FINISH in the same completion flow.

## Notes
- Execution starts only after explicit user start command.
