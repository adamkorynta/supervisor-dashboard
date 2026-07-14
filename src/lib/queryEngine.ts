/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { TimesheetEntry, QueryParams, Metrics, Filter } from '../types';
import { 
  startOfDay, endOfDay, 
  startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth,
  isWithinInterval 
} from 'date-fns';

export function queryData(
  data: TimesheetEntry[],
  params: QueryParams = { metrics: [] }
): any[] {
  let filtered = data;

  // 1. Filter by time range
  if (params.timeRange) {
    const startTime = startOfDay(params.timeRange.start).getTime();
    const endTime = endOfDay(params.timeRange.end).getTime();
    
    filtered = filtered.filter(d => {
      const entryTime = d.date.getTime();
      return entryTime >= startTime && entryTime <= endTime;
    });
  }

  // 2. Apply general filters
  if (params.filters) {
    filtered = filtered.filter(entry => {
      return params.filters!.every(filter => applyFilter(entry, filter));
    });
  }

  // 3. Grouping and Metrics
  if (params.groupBy || params.timeBucket) {
    const groups = new Map<string, TimesheetEntry[]>();
    filtered.forEach(entry => {
      let key = 'Unknown';
      if (params.timeBucket) {
        key = bucketDate(entry.date, params.timeBucket).toISOString().split('T')[0];
      } else if (params.groupBy) {
        key = String(entry[params.groupBy] || 'Unknown');
      }
      
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    });

    const results = Array.from(groups.entries()).map(([key, groupEntries]) => {
      const metrics = calculateMetrics(groupEntries, params.metrics);
      const result: any = {
        ...metrics,
        originalEntries: groupEntries
      };
      
      if (params.timeBucket) {
        result.date = key;
      } else {
        result[params.groupBy!] = key;
      }
      
      return result;
    });

    // 4. Sorting
    if (params.sort) {
      results.sort((a: any, b: any) => {
        const valA = a[params.sort!.field];
        const valB = b[params.sort!.field];
        if (valA < valB) return params.sort!.order === 'asc' ? -1 : 1;
        if (valA > valB) return params.sort!.order === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return params.limit ? results.slice(0, params.limit) : results;
  }

  // 3.5 Return filtered data if no metrics requested
  if (!params.metrics || params.metrics.length === 0) {
    return filtered;
  }

  // If no group by, return global metrics
  return [{
    ...calculateMetrics(filtered, params.metrics),
    originalEntries: filtered
  }];
}

function applyFilter(entry: TimesheetEntry, filter: Filter): boolean {
  const val = entry[filter.field];
  switch (filter.operator) {
    case 'eq': return val === filter.value;
    case 'neq': return val !== filter.value;
    case 'gt': return (val as any) > filter.value;
    case 'lt': return (val as any) < filter.value;
    case 'contains': return String(val).toLowerCase().includes(String(filter.value).toLowerCase());
    case 'in': return Array.isArray(filter.value) && filter.value.includes(val);
    case 'regex': return new RegExp(String(filter.value), 'i').test(String(val));
    default: return true;
  }
}

function calculateMetrics(entries: TimesheetEntry[], requested: (keyof Metrics)[] = []): Partial<Metrics> {
  const metrics: Partial<Metrics> = {};
  
  if (requested.includes('totalHours')) {
    metrics.totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  }
  
  if (requested.includes('totalCost')) {
    metrics.totalCost = entries.reduce((sum, e) => sum + (e.cost || 0), 0);
  }

  if (requested.includes('entryCount')) {
    metrics.entryCount = entries.length;
  }

  if (requested.includes('employeeCount')) {
    metrics.employeeCount = new Set(entries.map(e => e.employeeId || e.employeeName)).size;
  }

  if (requested.includes('projectCount')) {
    metrics.projectCount = new Set(entries.map(e => e.project)).size;
  }

  if (requested.includes('billablePercentage')) {
    const billableHours = entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0);
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    metrics.billablePercentage = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;
  }

  if (requested.includes('bizDevPercentage')) {
    const bizDevHours = entries.filter(e => e.category === 'BizDev').reduce((sum, e) => sum + e.hours, 0);
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    metrics.bizDevPercentage = totalHours > 0 ? (bizDevHours / totalHours) * 100 : 0;
  }

  if (requested.includes('revisedUtilization')) {
    const billableHours = entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0);
    const corporateHours = entries.filter(e => e.category === 'Corporate').reduce((sum, e) => sum + e.hours, 0);
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    metrics.revisedUtilization = totalHours > 0 ? ((billableHours + corporateHours) / totalHours) * 100 : 0;
  }

  if (requested.includes('utilizationGoal')) {
    // Take the target from the first entry that has it (should be consistent within the group)
    metrics.utilizationGoal = entries.find(e => e.utilizationGoal !== undefined)?.utilizationGoal;
  }

  if (requested.includes('averageRate')) {
    const entriesWithRate = entries.filter(e => e.rate !== undefined);
    const sumRate = entriesWithRate.reduce((sum, e) => sum + e.rate!, 0);
    metrics.averageRate = entriesWithRate.length > 0 ? sumRate / entriesWithRate.length : 0;
  }

  return metrics;
}

export function bucketDate(date: Date, bucket: 'day' | 'week' | 'month'): Date {
  if (bucket === 'day') return startOfDay(date);
  if (bucket === 'week') return startOfWeek(date, { weekStartsOn: 1 });
  if (bucket === 'month') return startOfMonth(date);
  return date;
}
