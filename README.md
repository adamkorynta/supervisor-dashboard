# Timesheet Analytics Dashboard

A Next.js dashboard for interactive timesheet analytics across branch, employee, supervisor/team, and project-management views. The app ingests CSV or XLSX timesheet exports, supervisor-chain mappings, optional projection files, and project snapshot exports, then normalizes them into shared analytics for charts, tables, and drill-down analysis.

## Features

- Branch, employee, and supervisor analytics views.
- CSV/XLSX upload for timesheet data.
- Separate supervisor-chain upload with unmatched employee diagnostics.
- Optional projection upload for team utilization trend context.
- Project snapshot upload for project-management overview and detail analytics.
- Project-management views for project budget, burn, funding remaining, task forecasts, contributor mix, and drill-down timesheet records.
- Schema preview and configurable column mapping for timesheet exports.
- Generic query engine for filtering, time ranges, grouping, metrics, sorting, and chart drill-downs.
- Local persistence through the Next.js API route at `/api/data`.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

The dev server binds to `0.0.0.0` through the configured Next.js script. Open the printed local URL in a browser.

## Docker Deployment

To build and run the application using Docker:

1. **Build the image:**

   ```bash
   docker build -t supervisor-dashboard .
   ```

2. **Run the container:**

   ```bash
   docker run -p 3000:3000 supervisor-dashboard
   ```

3. **Persistence (Optional but recommended):**
   To persist the uploaded dashboard data across container restarts, mount a local directory to the `/app/data` directory in the container:

   ```bash
   docker run -p 3000:3000 -v $(pwd)/data:/app/data supervisor-dashboard
   ```

   *Note: On Windows PowerShell, use `${PWD}` instead of `$(pwd)`.*

Run tests:

```bash
npm test
```

Build for production:

```bash
npm run build
```

## Upload Flow

1. Upload a timesheet export in CSV or XLSX format.
2. Review schema detection and column mapping. Required fields are employee name, hours, project, and at least one date field.
3. Optionally upload a supervisor-chain file.
4. Optionally upload projections.
5. Optionally upload a project snapshot export for project-management analytics.
6. Click **Generate Analytics Dashboard** to normalize, merge, persist, and view analytics.

Uploaded dashboard data is saved locally to `data/persistent_data.json` by `src/app/api/data/route.ts`. Treat that file as runtime data and avoid storing private timesheet exports in source control.

## Expected File Formats

### Timesheet Export

- Supported formats: CSV and XLSX.
- Default required columns: `Employee / Vendor / Client Name`, `Quantity`, `Project Name`, plus `Posting Date` or `Transaction Date`.
- Useful optional columns include `Project Code`, `Project Client Name`, `Billable`, `Effort`, `Effort Rate`, organization fields, manager name, and project description.
- Default mappings live in `src/lib/normalization.ts`.

### Supervisor Chain Mapping

- Supported formats: CSV and XLSX.
- Expected columns: `Employee ID` or `ID`, `Employee Name` or `Name`, `Supervisor ID` or `Manager ID`, `Supervisor Name` or `Manager Name`.
- Optional utilization target columns: `Utilization Goal`, `Target`, or `Goal`.

### Projections

- Supported formats: CSV and XLSX.
- Flat projection files can use employee ID/name, a week date such as `Date`, `Monday`, or `Week Start`, and projected hours.
- Matrix-style workload sheets are also supported when week headers can be detected.

### Project Snapshot Export

- Supported formats: XLSX and CSV when headers can be detected.
- The snapshot should include project code/name, project manager when available, project/task budget effort, and project/task start or finish dates when available.
- Projects with zero budget effort are filtered out of project-management analytics.
- Task rows in the snapshot are the source of truth for task-level project detail. Timesheet task descriptions should not create extra task rows when real snapshot tasks exist.
- Snapshot rollup rows such as `Professional Services` and `Engineering Services` are not treated as tasks when child task rows are present.
- If a project snapshot only contains a generated `Project Total` row, the app may fall back to timesheet task names/codes so the project still has a basic task breakdown. Those fallback tasks do not have task-level budgets unless a later snapshot supplies them.
- Timesheet/project matching uses project code/name, then task matching uses exact task name first and unique task code only when task name is unavailable.

## Project Management Views

### Project Management Overview

- Shows project-level budget effort, effort spent, budget remaining, weekly/monthly burn, and risk status.
- Effort values in project-management tables are formatted as dollars.
- Projects with already-past finish dates are moved to the end of the overview table.
- The overview includes project search, project-manager grouping, and click-through navigation into Project Management Detail.
- The global date filter is hidden on project-management tabs because PM analytics use the full project history.

### Project Management Detail

- Shows monthly project spending and monthly project funding remaining as project-level charts.
- Shows contributors for the selected project and a task budget table sourced from the project snapshot.
- Expanding a task row shows:
  - weekly task spending;
  - weekly task funding remaining;
  - task burn forecast;
  - contributor mix by task.
- Weekly task charts fill missing weeks. Spending fills with `$0`; funding remaining carries the previous remaining balance forward through no-spend weeks.
- Task row clicks open `DrillDownModal` filtered to the timesheet entries matched to that task.

## Trend And Forecast Rules

- Project-management trendlines use exponentially weighted regression so recent periods carry more influence than older periods.
- Task-level weekly trendlines use a 4-week half-life.
- Project-level monthly trendlines use a 3-month half-life.
- Task burn forecast uses exponentially weighted weekly burn with a 4-week half-life.
- The task table's weekly burn column remains a plain average for auditability.
- A project or task is not classified as over budget unless it is over budget by at least `$500`.

## Architecture

- `src/app`: Next.js App Router pages, layout, and API routes.
- `src/lib/normalization.ts`: Raw upload normalization, validation, projection parsing, category assignment, and supervisor merging.
- `src/lib/projectAnalytics.ts`: Project snapshot matching, project/task summaries, burn forecasts, funding remaining series, contributor mix, and PM trendline calculations.
- `src/lib/queryEngine.ts`: Shared query primitives for filters, time ranges, grouping, metrics, sorting, and date buckets.
- `src/lib/queryBuilder.ts`: Fluent builder for query parameters.
- `src/lib/DataContext.tsx`: Client data provider, persistence loading, date hydration, and active time range state.
- `src/types/index.ts`: Canonical TypeScript types, metrics, and category constants.
- `src/components`: Upload UI, filters, charts, drill-down modal, diagnostics, and dashboard views.

## Development Notes

- Keep normalization and parsing logic separate from UI components.
- Add tests when changing normalization, category detection, supervisor merging, query logic, or query builder behavior.
- Add tests when changing project snapshot parsing, project/task matching, burn forecasts, task fallback behavior, or trendline calculations.
- Keep dashboard metrics routed through the query engine where possible to avoid duplicate calculations.
- Surface skipped rows, unmatched employees, and schema/mapping issues to users.
- Preserve `originalEntries` on grouped query results when adding chart or table views that need drill-down behavior.
