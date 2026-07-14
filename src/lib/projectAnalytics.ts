/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { addDays, addWeeks, differenceInCalendarDays, endOfDay, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { formatCurrency, ProjectSnapshot, TimesheetEntry } from '@/types';

export type ProjectRisk = 'on-track' | 'watch' | 'at-risk' | 'over-budget' | 'unknown';

export interface ProjectSummary {
  project: ProjectSnapshot;
  entries: TimesheetEntry[];
  effortSpent: number;
  budgetHours: number;
  remainingHours: number;
  weeklyBurnRate: number;
  monthlyBurnRate: number;
  projectedHoursAtDueDate?: number;
  risk: ProjectRisk;
  riskDescription: string;
  sparkline: { label: string; hours: number }[];
}

export interface ProjectTaskSummary {
  taskName: string;
  taskCode?: string;
  entries: TimesheetEntry[];
  effortSpent: number;
  budgetHours: number;
  remainingHours: number;
  weeklyBurnRate: number;
  weightedWeeklyBurnRate?: number;
  monthlyBurnRate: number;
  projectedHoursAtDueDate?: number;
  weeksUntilBudgetExhausted?: number;
  budgetExhaustionDate?: Date;
  risk: ProjectRisk;
  riskDescription: string;
  sparkline: { label: string; hours: number }[];
  finishDate?: Date;
}

export interface TaskFundingRemainingSeries {
  taskName: string;
  taskCode?: string;
  budgetHours: number;
  rows: Record<string, number | string>[];
  series: string[];
}

export interface TaskEffortSeries {
  taskName: string;
  taskCode?: string;
  rows: Record<string, number | string>[];
  series: string[];
}

const ROLLUP_TASK_NAMES = new Set([
  'professional services',
  'engineering services'
]);
const BUDGET_OVERAGE_TOLERANCE = 500;
const TASK_WEEKLY_HALF_LIFE = 4;
const PROJECT_MONTHLY_HALF_LIFE = 3;

const addTrendlineForMetric = (rows: Record<string, number | string>[], field: string, series: string[], halfLifePeriods: number) => {
  if (rows.length === 0) return { rows, series: [...series, 'trendline'] };

  const values = rows.map(row => Number(row[field] || 0));
  const n = values.length;
  const weights = values.map((_, index) => calculateExponentialWeight(n - 1 - index, halfLifePeriods));
  const sumW = weights.reduce((total, weight) => total + weight, 0);
  const sumX = weights.reduce((total, weight, index) => total + (weight * index), 0);
  const sumY = weights.reduce((total, weight, index) => total + (weight * values[index]), 0);
  const sumXY = weights.reduce((total, weight, index) => total + (weight * index * values[index]), 0);
  const sumXX = weights.reduce((total, weight, index) => total + (weight * index * index), 0);
  const weightedDenominator = (sumW * sumXX) - (sumX * sumX);
  const slope = weightedDenominator === 0 ? 0 : ((sumW * sumXY) - (sumX * sumY)) / weightedDenominator;
  const intercept = sumW === 0 ? 0 : (sumY - (slope * sumX)) / sumW;

  return {
    rows: rows.map((row, index) => ({
      ...row,
      trendline: intercept + (slope * index)
    })),
    series: [...series, 'trendline']
  };
};

export function getProjectDisplayName(project: ProjectSnapshot): string {
  return [project.projectCode, project.projectName].filter(Boolean).join(' - ') || 'Unnamed Project';
}

export function matchesProject(entry: TimesheetEntry, project: ProjectSnapshot): boolean {
  const code = project.projectCode.trim().toLowerCase();
  const name = project.projectName.trim().toLowerCase();
  const entryCode = (entry.projectCode || '').trim().toLowerCase();
  const entryName = (entry.projectName || entry.project || '').trim().toLowerCase();
  const fullProject = (entry.project || '').trim().toLowerCase();

  if (code && (entryCode === code || fullProject.startsWith(code) || fullProject.includes(code))) return true;
  if (name && (entryName === name || fullProject.includes(name) || name.includes(entryName))) return true;
  return false;
}

export function getProjectEntries(entries: TimesheetEntry[], project: ProjectSnapshot): TimesheetEntry[] {
  return entries.filter(entry => matchesProject(entry, project));
}

export function buildProjectSummaries(projects: ProjectSnapshot[], entries: TimesheetEntry[]): ProjectSummary[] {
  return projects.map(project => buildProjectSummary(project, getProjectEntries(entries, project)));
}

export function buildProjectSummary(project: ProjectSnapshot, entries: TimesheetEntry[]): ProjectSummary {
  const effortSpent = sumHours(entries);
  const budgetHours = project.budgetHours || 0;
  const remainingHours = budgetHours - effortSpent;
  const weeklyBurnRate = calculateBurnRate(entries, 'week');
  const monthlyBurnRate = calculateBurnRate(entries, 'month');
  const sparkline = buildWeeklySparkline(entries);
  const { risk, projectedHoursAtDueDate, riskDescription } = assessRisk(project, effortSpent, budgetHours, weeklyBurnRate);

  return {
    project,
    entries,
    effortSpent,
    budgetHours,
    remainingHours,
    weeklyBurnRate,
    monthlyBurnRate,
    projectedHoursAtDueDate,
    risk,
    riskDescription,
    sparkline
  };
}

export function buildProjectTaskSummaries(project: ProjectSnapshot, entries: TimesheetEntry[]): ProjectTaskSummary[] {
  const taskCodeCounts = new Map<string, number>();
  const nonRollupTasks = project.tasks.filter(task => !isRollupTaskName(task.name));
  const snapshotTasks = nonRollupTasks.length > 0 ? nonRollupTasks : project.tasks;
  const taskSnapshots = snapshotTasks.length === 1 && isProjectTotalTask(snapshotTasks[0].name)
    ? buildTimesheetTaskFallbacks(entries, project)
    : snapshotTasks;

  taskSnapshots.forEach(task => {
    const normalizedCode = normalizeTaskKey(task.code || '');
    if (normalizedCode) taskCodeCounts.set(normalizedCode, (taskCodeCounts.get(normalizedCode) || 0) + 1);
  });

  return taskSnapshots.map(taskSnapshot => {
    const normalizedCode = normalizeTaskKey(taskSnapshot.code || '');
    const canMatchByCode = normalizedCode ? taskCodeCounts.get(normalizedCode) === 1 : false;
    const taskEntries = entries.filter(entry => matchesTask(entry, taskSnapshot.name, taskSnapshot.code, canMatchByCode));
    const effortSpent = sumHours(taskEntries);
    const budgetHours = taskSnapshot.budgetHours || 0;
    const finishDate = taskSnapshot?.finishDate || taskSnapshot?.dueDate;
    const weeklyBurnRate = calculateBurnRate(taskEntries, 'week');
    const weightedWeeklyBurnRate = calculateWeightedWeeklyBurnRate(taskEntries);
    const monthlyBurnRate = calculateBurnRate(taskEntries, 'month');
    const sparkline = buildWeeklySparkline(taskEntries);
    const remainingHours = budgetHours - effortSpent;
    const forecastBurnRate = weightedWeeklyBurnRate || weeklyBurnRate;
    const weeksUntilBudgetExhausted = forecastBurnRate > 0 && budgetHours > 0
      ? Math.max(0, remainingHours / forecastBurnRate)
      : undefined;
    const budgetExhaustionDate = weeksUntilBudgetExhausted !== undefined
      ? addDays(startOfDay(new Date()), Math.round(weeksUntilBudgetExhausted * 7))
      : undefined;
    const { risk, projectedHoursAtDueDate, riskDescription } = assessRisk({
      ...project,
      dueDate: finishDate || project.dueDate
    }, effortSpent, budgetHours, forecastBurnRate);

    return {
      taskName: taskSnapshot.name,
      taskCode: taskSnapshot.code,
      entries: taskEntries,
      effortSpent,
      budgetHours,
      remainingHours,
      weeklyBurnRate,
      weightedWeeklyBurnRate,
      monthlyBurnRate,
      projectedHoursAtDueDate,
      weeksUntilBudgetExhausted,
      budgetExhaustionDate,
      risk,
      riskDescription,
      sparkline,
      finishDate
    };
  }).sort((a, b) => (a.finishDate?.getTime() || 0) - (b.finishDate?.getTime() || 0) || naturalCompare(a.taskName, b.taskName));
}

export function buildProjectTimeSeries(project: ProjectSnapshot, entries: TimesheetEntry[]) {
  const byMonth = new Map<string, Record<string, number | string>>();

  entries.forEach(entry => {
    const bucket = format(startOfMonth(entry.date), 'yyyy-MM');
    if (!byMonth.has(bucket)) byMonth.set(bucket, { month: bucket, total: 0 });
    const row = byMonth.get(bucket)!;
    row.total = Number(row.total || 0) + getEntryEffort(entry);
  });

  const rows = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);

  return addTrendlineForMetric(rows, 'total', ['total'], PROJECT_MONTHLY_HALF_LIFE);
}

export function buildTaskEffortTimeSeries(project: ProjectSnapshot, entries: TimesheetEntry[]): TaskEffortSeries[] {
  return buildProjectTaskSummaries(project, entries)
    .filter(task => task.entries.length > 0)
    .map(task => {
      const byWeek = new Map<string, Record<string, number | string>>();
      task.entries.forEach(entry => {
        const bucket = format(startOfWeek(entry.date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        if (!byWeek.has(bucket)) byWeek.set(bucket, { week: bucket, total: 0 });
        const row = byWeek.get(bucket)!;
        row.total = Number(row.total || 0) + getEntryEffort(entry);
      });

      const rows = getSortedWeekKeys(byWeek.keys()).map(week => byWeek.get(week) || { week, total: 0 });
      const result = addTrendlineForMetric(rows, 'total', ['total'], TASK_WEEKLY_HALF_LIFE);

      return {
        taskName: task.taskName,
        taskCode: task.taskCode,
        rows: result.rows,
        series: ['total', 'trendline']
      };
    });
}

export function buildFundingRemainingTimeSeries(project: ProjectSnapshot, entries: TimesheetEntry[]) {
  const months = new Set<string>();
  const projectSpendByMonth = new Map<string, number>();

  entries.forEach(entry => {
    const bucket = format(startOfMonth(entry.date), 'yyyy-MM');
    months.add(bucket);
    projectSpendByMonth.set(bucket, (projectSpendByMonth.get(bucket) || 0) + getEntryEffort(entry));
  });

  const sortedMonths = Array.from(months).sort();
  let cumulativeSpend = 0;
  const budgetHours = project.budgetHours || 0;

  const rows = sortedMonths.map(month => {
    const monthlySpend = projectSpendByMonth.get(month) || 0;
    cumulativeSpend += monthlySpend;

    const row: Record<string, number | string> = {
      month,
      remaining: budgetHours - cumulativeSpend,
      cumulativeSpend,
      monthlySpend
    };
    return row;
  });

  const result = addTrendlineForMetric(rows, 'remaining', ['remaining'], PROJECT_MONTHLY_HALF_LIFE);
  return {
    ...result,
    series: ['remaining', 'trendline']
  };
}

export function buildTaskFundingRemainingTimeSeries(project: ProjectSnapshot, entries: TimesheetEntry[]): TaskFundingRemainingSeries[] {
  return buildProjectTaskSummaries(project, entries)
    .filter(task => task.entries.length > 0 && task.budgetHours > 0)
    .map(task => {
      const spendByWeek = new Map<string, number>();
      task.entries.forEach(entry => {
        const bucket = format(startOfWeek(entry.date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        spendByWeek.set(bucket, (spendByWeek.get(bucket) || 0) + getEntryEffort(entry));
      });

      let cumulativeSpend = 0;
      const rows = getSortedWeekKeys(spendByWeek.keys())
        .map(week => {
          const weeklySpend = spendByWeek.get(week) || 0;
          cumulativeSpend += weeklySpend;
          return {
            week,
            remaining: task.budgetHours - cumulativeSpend,
            cumulativeSpend,
            weeklySpend
          };
        });

      const result = addTrendlineForMetric(rows, 'remaining', ['remaining'], TASK_WEEKLY_HALF_LIFE);
      return {
        taskName: task.taskName,
        taskCode: task.taskCode,
        budgetHours: task.budgetHours,
        rows: result.rows,
        series: ['remaining', 'trendline']
      };
    });
}

export function buildContributorData(entries: TimesheetEntry[]) {
  const employees = new Map<string, number>();
  entries.forEach(entry => {
    employees.set(entry.employeeName, (employees.get(entry.employeeName) || 0) + entry.hours);
  });

  return Array.from(employees.entries())
    .map(([employeeName, hours]) => ({ employeeName, hours }))
    .sort((a, b) => b.hours - a.hours);
}

export function buildContributorEffortData(entries: TimesheetEntry[]) {
  const employees = new Map<string, number>();
  entries.forEach(entry => {
    employees.set(entry.employeeName, (employees.get(entry.employeeName) || 0) + getEntryEffort(entry));
  });

  return Array.from(employees.entries())
    .map(([employeeName, effort]) => ({ employeeName, effort, originalEntries: entries.filter(e => e.employeeName === employeeName) }))
    .sort((a, b) => b.effort - a.effort);
}

export function buildTaskContributorData(taskSummaries: ProjectTaskSummary[]) {
  const treemapData: any[] = [];
  const nodes: { name: string }[] = [];
  const links: { source: number; target: number; value: number; originalEntries: TimesheetEntry[] }[] = [];
  
  const nodeMap = new Map<string, number>();
  const getNode = (name: string) => {
    if (!nodeMap.has(name)) {
      nodeMap.set(name, nodes.length);
      nodes.push({ name });
    }
    return nodeMap.get(name)!;
  };

  const sortedTaskSummaries = [...taskSummaries].sort((a, b) => naturalCompare(a.taskName, b.taskName));

  sortedTaskSummaries.forEach(task => {
    if (task.effortSpent <= 0) return;

    const taskNodeIdx = getNode(task.taskName);

    // Group contributors for this task
    const contributors = new Map<string, { effort: number; entries: TimesheetEntry[] }>();
    task.entries.forEach(entry => {
      const existing = contributors.get(entry.employeeName) || { effort: 0, entries: [] };
      contributors.set(entry.employeeName, {
        effort: existing.effort + getEntryEffort(entry),
        entries: [...existing.entries, entry]
      });
    });

    const children = Array.from(contributors.entries()).map(([employeeName, val]) => {
      const contributorNodeIdx = getNode(employeeName);
      links.push({
        source: taskNodeIdx,
        target: contributorNodeIdx,
        value: val.effort,
        originalEntries: val.entries
      });

      return {
        name: employeeName,
        value: val.effort,
        taskName: task.taskName,
        originalEntries: val.entries
      };
    }).sort((a, b) => b.value - a.value);

    treemapData.push({
      name: task.taskName,
      children
    });
  });

  return {
    treemapData: [{ name: 'Project', children: treemapData }],
    sankeyData: { nodes, links },
    data: treemapData.flatMap(t => t.children),
    series: [] 
  };
}

function sumHours(entries: TimesheetEntry[]): number {
  return entries.reduce((total, entry) => total + getEntryEffort(entry), 0);
}

function matchesTask(entry: TimesheetEntry, taskName: string, taskCode?: string, canMatchByCode = false): boolean {
  const entryTaskName = normalizeTaskKey(entry.taskName || '');
  const entryTaskCode = normalizeTaskKey(entry.taskCode || '');
  const normalizedTaskName = normalizeTaskKey(taskName);
  const normalizedTaskCode = normalizeTaskKey(taskCode || '');

  if (entryTaskName && normalizedTaskName && entryTaskName === normalizedTaskName) return true;
  if (entryTaskName) return false;
  if (canMatchByCode && entryTaskCode && normalizedTaskCode && entryTaskCode === normalizedTaskCode) return true;

  return false;
}

function normalizeTaskKey(value: string): string {
  return value.trim().toLowerCase();
}

function isRollupTaskName(taskName: string): boolean {
  return ROLLUP_TASK_NAMES.has(normalizeTaskKey(taskName));
}

function isProjectTotalTask(taskName: string): boolean {
  return normalizeTaskKey(taskName) === 'project total';
}

function buildTimesheetTaskFallbacks(entries: TimesheetEntry[], project: ProjectSnapshot) {
  const tasks = new Map<string, { id: string; name: string; code?: string; budgetHours: number; finishDate?: Date; dueDate?: Date }>();

  entries.forEach(entry => {
    const taskName = (entry.taskName || '').trim();
    if (!taskName || taskName === '****') return;

    const taskCode = (entry.taskCode || '').trim();
    const key = `${normalizeTaskKey(taskCode)}::${normalizeTaskKey(taskName)}`;
    if (!tasks.has(key)) {
      tasks.set(key, {
        id: `timesheet-task-${key}`,
        name: taskName,
        code: taskCode || undefined,
        budgetHours: 0,
        finishDate: project.finishDate || project.dueDate,
        dueDate: project.dueDate || project.finishDate
      });
    }
  });

  return Array.from(tasks.values());
}

function getSortedWeekKeys(weeks: Iterable<string>): string[] {
  const sortedWeeks = Array.from(weeks).sort();
  if (sortedWeeks.length <= 1) return sortedWeeks;

  const firstWeek = new Date(`${sortedWeeks[0]}T00:00:00`);
  const lastWeek = new Date(`${sortedWeeks[sortedWeeks.length - 1]}T00:00:00`);
  const filledWeeks: string[] = [];

  for (let cursor = firstWeek; cursor <= lastWeek; cursor = addWeeks(cursor, 1)) {
    filledWeeks.push(format(cursor, 'yyyy-MM-dd'));
  }

  return filledWeeks;
}

function calculateExponentialWeight(periodsAgo: number, halfLifePeriods: number): number {
  if (halfLifePeriods <= 0) return 1;
  return Math.pow(0.5, periodsAgo / halfLifePeriods);
}

function calculateWeightedWeeklyBurnRate(entries: TimesheetEntry[]): number {
  if (entries.length === 0) return 0;

  const spendByWeek = new Map<string, number>();
  entries.forEach(entry => {
    const key = format(startOfWeek(entry.date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    spendByWeek.set(key, (spendByWeek.get(key) || 0) + getEntryEffort(entry));
  });

  const weeks = getSortedWeekKeys(spendByWeek.keys());
  if (weeks.length === 0) return 0;

  const weightedTotals = weeks.reduce((state, week, index) => {
    const periodsAgo = weeks.length - 1 - index;
    const weight = calculateExponentialWeight(periodsAgo, TASK_WEEKLY_HALF_LIFE);
    return {
      weightedSpend: state.weightedSpend + (weight * (spendByWeek.get(week) || 0)),
      weightTotal: state.weightTotal + weight
    };
  }, { weightedSpend: 0, weightTotal: 0 });

  return weightedTotals.weightTotal === 0 ? 0 : weightedTotals.weightedSpend / weightedTotals.weightTotal;
}

function calculateBurnRate(entries: TimesheetEntry[], bucket: 'week' | 'month'): number {
  if (entries.length === 0) return 0;

  const buckets = new Map<string, number>();
  entries.forEach(entry => {
    const bucketStart = bucket === 'week'
      ? startOfWeek(entry.date, { weekStartsOn: 1 })
      : startOfMonth(entry.date);
    const key = format(bucketStart, bucket === 'week' ? 'yyyy-MM-dd' : 'yyyy-MM');
    buckets.set(key, (buckets.get(key) || 0) + getEntryEffort(entry));
  });

  return Array.from(buckets.values()).reduce((total, hours) => total + hours, 0) / buckets.size;
}

function buildWeeklySparkline(entries: TimesheetEntry[]) {
  const buckets = new Map<string, number>();
  entries.forEach(entry => {
    const key = format(startOfWeek(entry.date, { weekStartsOn: 1 }), 'MM/dd');
    buckets.set(key, (buckets.get(key) || 0) + getEntryEffort(entry));
  });

  return Array.from(buckets.entries())
    .slice(-8)
    .map(([label, hours]) => ({ label, hours }));
}

function assessRisk(project: ProjectSnapshot, effortSpent: number, budgetHours: number, weeklyBurnRate: number) {
  if (!budgetHours) {
    return {
      risk: 'unknown' as ProjectRisk,
      projectedHoursAtDueDate: undefined,
      riskDescription: 'No budget effort was found in the project snapshot, so burn-rate risk cannot be calculated.'
    };
  }

  const actualOverage = effortSpent - budgetHours;
  if (actualOverage >= BUDGET_OVERAGE_TOLERANCE) {
    return {
      risk: 'over-budget' as ProjectRisk,
      projectedHoursAtDueDate: effortSpent,
      riskDescription: 'Actual effort already exceeds the project budget.'
    };
  }

  if (!project.dueDate || weeklyBurnRate === 0) {
    return {
      risk: weeklyBurnRate === 0 ? 'unknown' as ProjectRisk : 'watch' as ProjectRisk,
      projectedHoursAtDueDate: effortSpent,
      riskDescription: project.dueDate
        ? 'No recent burn rate is available yet for this project.'
        : 'No due date was found in the project snapshot.'
    };
  }

  const today = startOfDay(new Date());
  const dueDate = endOfDay(project.dueDate);
  const daysRemaining = Math.max(0, differenceInCalendarDays(dueDate, today));
  const projectedHoursAtDueDate = effortSpent + (weeklyBurnRate * (daysRemaining / 7));
  const projectedRemaining = budgetHours - projectedHoursAtDueDate;

  if (projectedRemaining <= -BUDGET_OVERAGE_TOLERANCE) {
    return {
      risk: 'at-risk' as ProjectRisk,
      projectedHoursAtDueDate,
      riskDescription: `At the current weekly burn rate, projected effort reaches ${formatCurrency(projectedHoursAtDueDate)} by ${format(project.dueDate, 'MMM d, yyyy')}, above the ${formatCurrency(budgetHours)} budget.`
    };
  }

  const bufferPercent = projectedRemaining / budgetHours;
  return {
    risk: bufferPercent < 0.1 ? 'watch' as ProjectRisk : 'on-track' as ProjectRisk,
    projectedHoursAtDueDate,
    riskDescription: `At the current weekly burn rate, projected effort reaches ${formatCurrency(projectedHoursAtDueDate)} by ${format(project.dueDate, 'MMM d, yyyy')}, leaving ${formatCurrency(projectedRemaining)}.`
  };
}

function getEntryEffort(entry: TimesheetEntry): number {
  return Number.isFinite(entry.cost) ? entry.cost || 0 : 0;
}

/**
 * Natural sort comparison for strings that may contain numbers (e.g. "CLIN 2001" vs "CLIN 10001")
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
