/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { endOfDay, startOfDay } from 'date-fns';
import { ProjectionEntry, TimesheetEntry } from '@/types';

export function getFridayPostingDate(date: Date) {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localDate.getDay();
  const daysToFriday = (5 - day + 7) % 7;
  localDate.setDate(localDate.getDate() + daysToFriday);
  return localDate;
}

export function dateKey(date: Date) {
  return date.toISOString().split('T')[0];
}

export function getProjectionBillablePercentage(projections: ProjectionEntry[]) {
  const totals = projections.reduce((acc, projection) => {
    const billable = projection.billableHours ?? projection.projectedHours ?? 0;
    const overhead = projection.overheadHours ?? 0;
    const scheduledTotal = billable + overhead;
    const total = projection.totalProjectedHours && projection.totalProjectedHours > 0
      ? projection.totalProjectedHours
      : scheduledTotal;
    acc.billable += Math.min(Math.max(billable, 0), total);
    acc.total += total;
    return acc;
  }, { billable: 0, total: 0 });

  if (totals.total > 0) return (totals.billable / totals.total) * 100;
  return null;
}

export function normalizeTargetPercentage(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value <= 1 ? value * 100 : value;
}

export function getProjectionTotalHours(projection: ProjectionEntry) {
  const billable = projection.billableHours ?? projection.projectedHours ?? 0;
  const overhead = projection.overheadHours ?? 0;
  return projection.totalProjectedHours ?? billable + overhead;
}

export function getWeightedTargetForEntries(entries: TimesheetEntry[], employeeTargets: Map<string, number>) {
  const weighted = entries.reduce((acc, entry) => {
    const target = employeeTargets.get(entry.employeeName);
    if (target === undefined || entry.hours <= 0) return acc;

    acc.weightedTarget += target * entry.hours;
    acc.weight += entry.hours;
    return acc;
  }, { weightedTarget: 0, weight: 0 });

  return weighted.weight > 0 ? weighted.weightedTarget / weighted.weight : null;
}

export function getWeightedTargetForProjections(
  projections: ProjectionEntry[],
  employeeTargets: Map<string, number>
) {
  const weighted = projections.reduce((acc, projection) => {
    const target = employeeTargets.get(projection.employeeName);
    const projectedHours = getProjectionTotalHours(projection);
    if (target === undefined || projectedHours <= 0) return acc;

    acc.weightedTarget += target * projectedHours;
    acc.weight += projectedHours;
    return acc;
  }, { weightedTarget: 0, weight: 0 });

  return weighted.weight > 0 ? weighted.weightedTarget / weighted.weight : null;
}

export function buildWeeklyUtilizationTrend(
  entries: TimesheetEntry[],
  projections: ProjectionEntry[],
  timeRange: { start: Date; end: Date } | null,
  employeeTargets: Map<string, number>
) {
  const buckets = new Map<string, {
    date: Date;
    entries: TimesheetEntry[];
    projections: ProjectionEntry[];
  }>();
  const startTime = timeRange ? startOfDay(timeRange.start).getTime() : null;
  const endTime = timeRange ? endOfDay(timeRange.end).getTime() : null;

  const ensureBucket = (postingDate: Date) => {
    const friday = getFridayPostingDate(postingDate);
    const key = dateKey(friday);
    const existing = buckets.get(key);
    if (existing) return existing;

    const bucket = { date: friday, entries: [], projections: [] };
    buckets.set(key, bucket);
    return bucket;
  };

  entries.forEach(entry => {
    const postingDate = entry.postingDate || entry.date;
    const postingTime = postingDate.getTime();
    if ((startTime !== null && postingTime < startTime) || (endTime !== null && postingTime > endTime)) return;
    ensureBucket(postingDate).entries.push(entry);
  });

  projections.forEach(projection => {
    const postingDate = getFridayPostingDate(projection.date);
    const postingTime = postingDate.getTime();
    if ((startTime !== null && postingTime < startTime) || (endTime !== null && postingTime > endTime)) return;
    ensureBucket(postingDate).projections.push(projection);
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(bucket => {
      const totalHours = bucket.entries.reduce((sum, entry) => sum + entry.hours, 0);
      const revisedHours = bucket.entries
        .filter(entry => entry.billable || entry.category === 'Corporate')
        .reduce((sum, entry) => sum + entry.hours, 0);
      const actualWeightedTarget = getWeightedTargetForEntries(bucket.entries, employeeTargets);
      const projectedWeightedTarget = getWeightedTargetForProjections(bucket.projections, employeeTargets);

      return {
        date: dateKey(bucket.date),
        revisedUtilization: totalHours > 0 ? (revisedHours / totalHours) * 100 : null,
        target: actualWeightedTarget ?? projectedWeightedTarget ?? 0,
        projection: getProjectionBillablePercentage(bucket.projections),
        originalEntries: bucket.entries
      };
    });
}
