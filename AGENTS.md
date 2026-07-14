# AGENTS.md

Guidance for coding agents working on this timesheet analytics dashboard.

## Project Purpose

This is a Next.js, TypeScript, Tailwind/Bootstrap, and Recharts application for timesheet analytics. It supports:

- Branch and organization analytics.
- Employee analytics.
- Supervisor and team analytics.
- Project-management analytics.
- CSV/XLSX uploads for timesheets, supervisor chains, weekly projections, and project snapshots.

The project should remain ready for future AI-driven querying and visualization. Prefer reusable query primitives and clear data contracts over one-off dashboard calculations.

## Current Architecture

- `src/app`: Next.js App Router pages, layout, and API routes.
- `src/app/api/data/route.ts`: Local persistence API backed by `data/persistent_data.json`.
- `src/lib/normalization.ts`: CSV/XLSX row normalization, schema mapping validation, projection normalization, and supervisor merging.
- `src/lib/queryEngine.ts`: Generic filtering, time range filtering, grouping, sorting, bucketing, and metric calculation.
- `src/lib/queryBuilder.ts`: Fluent builder for `QueryParams`.
- `src/lib/projectAnalytics.ts`: Project/task matching, project-management summaries, burn forecasts, funding remaining time series, contributor mix, and trendline calculations.
- `src/lib/DataContext.tsx`: Client-side data loading, hydration of persisted dates, global time range, and data bounds.
- `src/types/index.ts`: Canonical data contracts, metrics, category constants, and regex/category rules.
- `src/components`: Small client components for upload, filters, charts, drill-downs, and dashboards.
- `src/lib/*.test.ts`: Jest tests for normalization and query behavior.

## Commands

- Install dependencies: `npm install`
- Run the dev server: `npm run dev`
- Build: `npm run build`
- Run tests: `npm test`

Note: `npm run lint` currently maps to `next lint`; verify compatibility before assuming it works with the installed Next.js version.

## Architecture Rules

- Keep parsing, schema detection, category assignment, and supervisor merging out of UI components.
- Keep the query engine separate from dashboard rendering.
- Use `queryData`, `QueryParams`, and `QueryBuilder` for shared filtering, grouping, sorting, and metrics.
- Avoid duplicating metric logic across `BranchDashboard`, `PersonalDashboard`, and `SupervisorDashboard`.
- Keep project-management-specific matching, burn forecasts, funding series, and trendline calculations in `src/lib/projectAnalytics.ts`, not inside UI components.
- Put canonical fields and cross-dashboard constants in `src/types/index.ts`.
- Prefer `@/` imports for app code when practical; the alias maps to `src/*`.

## Data Rules

- Timesheet uploads may be CSV or XLSX.
- Supervisor chain, projections, and project snapshots are uploaded separately.
- Prefer employee ID for joins; fall back to normalized employee name when ID is missing.
- Prefer project code for project joins; fall back to normalized project name when needed.
- For project-management detail, snapshot task rows are the source of truth for task rows. Do not derive additional task rows from timesheet descriptions when real snapshot tasks exist.
- When the snapshot only has a generated `Project Total` task, project analytics may fall back to timesheet task names/codes so the detail page still has a basic task breakdown.
- Ignore snapshot rollup rows such as `Professional Services` and `Engineering Services` when child task rows are present.
- Filter projects with zero budget effort out of project-management analytics.
- Task matching should prefer exact task name. Use task code only when the snapshot task code is unique and the timesheet task name is unavailable.
- Always surface unmatched supervisor mappings and ambiguous mappings in the UI.
- Never silently discard rows. Report skipped row counts and reasons through diagnostics, logs, or visible UI state.
- Preserve raw upload headers in `NormalizedData` so users can inspect schema detection results.
- Rehydrate serialized dates after reading persisted JSON; query logic and project analytics expect real `Date` objects.
- Treat `data/persistent_data.json` as local runtime state, not source truth. Avoid committing private timesheet data.

## Project Management Rules

- Hide the global date filter on project-management tabs; these views use full project history rather than the current dashboard date range.
- Format project-management effort values as dollars.
- Move projects with already-past finish dates to the end of the Project Management Overview table.
- Project Management Overview should support project search and click-through into Project Management Detail.
- Project Management Detail should keep project-level plots monthly and task-level plots weekly.
- Project-level plots include monthly project spending and monthly project funding remaining.
- Expanded task rows include weekly task spending, weekly task funding remaining, task burn forecast, and contributor mix by task.
- Weekly task plots must fill missing weeks. Spending fills missing weeks with `0`; funding remaining carries the prior remaining balance forward.
- Clicking task table rows should preserve `DrillDownModal` access for the matched timesheet records; use a separate expand control for task charts.
- Contributor mix by task should use cost/effort dollars, not hours, to stay consistent with project-management tables.
- Do not classify a project or task as over budget unless it exceeds budget by at least `$500`.

## Trend And Forecast Rules

- Trendlines in project-management charts use exponentially weighted regression so recent periods matter more.
- Task-level weekly trendlines use a 4-week half-life.
- Project-level monthly trendlines use a 3-month half-life.
- Task burn forecast uses exponentially weighted weekly burn with a 4-week half-life.
- Keep the task table's `Weekly Burn` column as the plain weekly average for auditability.
- Budget runway should be calculated from remaining budget divided by the exponentially weighted forecast burn rate when available.

## UX Rules

- Provide loading, empty, and error states for upload flows and dashboard views.
- Show schema detection or mapping information after upload.
- Keep charts, filters, and labels understandable for non-technical users.
- Keep dashboard components composable and focused.
- Maintain drill-down access where charts aggregate underlying timesheet entries.
- Keep PM Detail visually focused: use project-level charts for overall context and task-row expansion for task-specific charts/details.

## Testing Expectations

- Add or update Jest tests for changes to:
  - normalization, date parsing, category detection, or supervisor merging;
  - query filtering, metrics, grouping, sorting, and time bucketing;
  - query builder behavior;
  - project snapshot parsing, task/project matching, rollup filtering, zero-budget filtering, project/task burn forecasts, weighted trendline behavior, and project-management time series.
- Use focused test data with explicit dates, categories, and expected hour totals.
- Run `npm test` before handing off changes that affect data logic.
- For UI-only edits, run the most relevant checks available and manually verify important loading/empty/error states when feasible.

## Code Quality

- Use TypeScript strictly and keep public data contracts typed.
- Avoid `any` in new code unless it is at a raw upload boundary; normalize quickly into typed structures.
- Prefer structured parsing APIs such as Papa Parse and XLSX helpers over ad hoc string parsing.
- Keep comments sparse and useful; explain business rules or tricky date/category behavior.
- Be careful with existing proprietary headers in source files. Preserve them in files that already include them.

## Implementation Notes

- `normalizeTimesheet` currently assigns categories such as `Billable`, `Admin`, `BizDev`, `PPL`, `Corporate`, `IT`, and `Other`.
- `mergeSupervisors` should keep unmatched employees visible through `unmatchedEmployees`.
- `queryData` attaches `originalEntries` to grouped results so charts and tables can support drill-downs.
- The app stores uploaded analytics data through `/api/data`; large payload behavior and date hydration are important regression areas.
