/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useMemo, useState } from 'react';
import { endOfDay, format, startOfDay } from 'date-fns';
import { BarChart3, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, List, Table2 } from 'lucide-react';
import { useData } from '@/lib/DataContext';
import DrillDownModal from '@/components/DrillDownModal';
import { ProjectionEntry, TimesheetEntry } from '@/types';

type ProjectionComparisonRow = {
  key: string;
  postingDate: Date;
  employeeName: string;
  actualTotalHours: number;
  actualBillableHours: number;
  actualOverheadHours: number;
  actualAdminTrainingHours: number;
  actualBusinessDevelopmentHours: number;
  actualPplHolidayHours: number;
  actualUtilization: number | null;
  projectedBillableHours: number;
  projectedOverheadHours: number;
  projectedAdminTrainingHours: number;
  projectedBusinessDevelopmentHours: number;
  projectedPplHolidayHours: number;
  projectedOtherOverheadHours: number;
  projectedTotalHours: number;
  projectedUtilization: number | null;
  targetBillablePercentage: number | null;
  billableVariance: number;
  overheadVariance: number;
  targetVariance: number | null;
  actualVariance: number | null;
  utilizationVariance: number | null;
  originalEntries: TimesheetEntry[];
};

type ProjectionAggregate = {
  actualTotalHours: number;
  actualBillableHours: number;
  actualOverheadHours: number;
  projectedBillableHours: number;
  projectedOverheadHours: number;
  projectedTotalHours: number;
  projectedUtilizationBillableHours: number;
  projectedUtilizationTotalHours: number;
  targetWeightedTotal: number;
  targetWeight: number;
  matchedRows: number;
  totalRows: number;
};

type ProjectionRollupRow = Omit<ProjectionComparisonRow, 'key' | 'postingDate'> & {
  key: string;
  weekCount: number;
  weeklyRows: ProjectionComparisonRow[];
};

const percent = (value: number | null | undefined) => (
  value === null || value === undefined || !Number.isFinite(value) ? '-' : `${value.toFixed(1)}%`
);

const signedPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.05) return '0.0 pts';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
};

const varianceClass = (value: number | null, tolerance = 2) => {
  if (value === null || !Number.isFinite(value) || Math.abs(value) <= tolerance) return 'text-muted';
  return value > 0 ? 'text-success' : 'text-danger';
};

const getActualCategoryBuckets = (entries: TimesheetEntry[]) => {
  return entries.reduce((acc, entry) => {
    if (entry.billable) {
      acc.billable += entry.hours;
    } else if (entry.category === 'BizDev') {
      acc.businessDevelopment += entry.hours;
    } else if (entry.category === 'PPL' || entry.category === 'Holiday') {
      acc.pplHoliday += entry.hours;
    } else if (entry.category === 'Admin' || entry.category === 'Corporate' || entry.category === 'IT') {
      acc.adminTraining += entry.hours;
    } else {
      acc.otherOverhead += entry.hours;
    }
    acc.total += entry.hours;
    return acc;
  }, {
    total: 0,
    billable: 0,
    adminTraining: 0,
    businessDevelopment: 0,
    pplHoliday: 0,
    otherOverhead: 0
  });
};

const getFridayPostingDate = (date: Date) => {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localDate.getDay();
  const daysToFriday = (5 - day + 7) % 7;
  localDate.setDate(localDate.getDate() + daysToFriday);
  return localDate;
};

const projectionWeekKey = (employeeName: string, date: Date) =>
  `${employeeName}::${getFridayPostingDate(date).toISOString().split('T')[0]}`;

const normalizeTargetPercentage = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value <= 1 ? value * 100 : value;
};

const getTargetWeight = (row: Pick<ProjectionComparisonRow, 'actualTotalHours' | 'projectedTotalHours'>) => {
  if (row.actualTotalHours > 0) return row.actualTotalHours;
  return row.projectedTotalHours > 0 ? row.projectedTotalHours : 0;
};

const getWeightedTarget = (rows: ProjectionComparisonRow[]) => {
  const weighted = rows.reduce((acc, row) => {
    if (row.targetBillablePercentage === null) return acc;
    const weight = getTargetWeight(row);
    if (weight <= 0) return acc;

    acc.weightedTarget += row.targetBillablePercentage * weight;
    acc.weight += weight;
    return acc;
  }, { weightedTarget: 0, weight: 0 });

  return weighted.weight > 0 ? weighted.weightedTarget / weighted.weight : null;
};

const getProjectedUtilizationDenominator = (row: Pick<ProjectionComparisonRow, 'projectedBillableHours' | 'projectedOverheadHours' | 'projectedTotalHours'>) => {
  if (row.projectedTotalHours > 0) return row.projectedTotalHours;
  return row.projectedBillableHours + row.projectedOverheadHours;
};

const getProjectedUtilizationBillableHours = (row: Pick<ProjectionComparisonRow, 'projectedBillableHours' | 'projectedOverheadHours' | 'projectedTotalHours'>) => {
  const denominator = getProjectedUtilizationDenominator(row);
  if (denominator <= 0) return 0;
  return Math.min(Math.max(row.projectedBillableHours, 0), denominator);
};

export default function ProjectionsDashboard() {
  const { data, timeRange } = useData();
  const [drillDownEntries, setDrillDownEntries] = useState<TimesheetEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  const range = useMemo(() => {
    if (timeRange) return { start: startOfDay(timeRange.start), end: endOfDay(timeRange.end) };
    if (!data?.entries.length && !data?.projections.length) return null;

    const timestamps = [
      ...(data?.entries || []).map(entry => entry.date.getTime()),
      ...(data?.projections || []).map(projection => projection.date.getTime())
    ].filter(Number.isFinite);

    if (timestamps.length === 0) return null;
    return {
      start: startOfDay(new Date(Math.min(...timestamps))),
      end: endOfDay(new Date(Math.max(...timestamps)))
    };
  }, [data, timeRange]);

  const employeeTargets = useMemo(() => {
    const targets = new Map<string, number>();
    data?.supervisors.forEach(mapping => {
      const target = normalizeTargetPercentage(mapping.utilizationGoal);
      if (target !== null) targets.set(mapping.employeeName, target);
    });
    data?.entries.forEach(entry => {
      const target = normalizeTargetPercentage(entry.utilizationGoal);
      if (target !== null) targets.set(entry.employeeName, target);
    });
    return targets;
  }, [data]);

  const comparisonRows = useMemo<ProjectionComparisonRow[]>(() => {
    if (!data || !range) return [];

    const rowMap = new Map<string, ProjectionComparisonRow>();
    const ensureRow = (employeeName: string, postingDate: Date) => {
      const key = projectionWeekKey(employeeName, postingDate);
      const existing = rowMap.get(key);
      if (existing) return existing;

      const row: ProjectionComparisonRow = {
        key,
        postingDate: getFridayPostingDate(postingDate),
        employeeName,
        actualTotalHours: 0,
        actualBillableHours: 0,
        actualOverheadHours: 0,
        actualAdminTrainingHours: 0,
        actualBusinessDevelopmentHours: 0,
        actualPplHolidayHours: 0,
        actualUtilization: null,
        projectedBillableHours: 0,
        projectedOverheadHours: 0,
        projectedAdminTrainingHours: 0,
        projectedBusinessDevelopmentHours: 0,
        projectedPplHolidayHours: 0,
        projectedOtherOverheadHours: 0,
        projectedTotalHours: 0,
        projectedUtilization: null,
        targetBillablePercentage: employeeTargets.get(employeeName) ?? null,
        billableVariance: 0,
        overheadVariance: 0,
        targetVariance: null,
        actualVariance: null,
        utilizationVariance: null,
        originalEntries: []
      };
      rowMap.set(key, row);
      return row;
    };

    const actualByPostingDate = new Map<string, TimesheetEntry[]>();
    data.entries.forEach(entry => {
      const entryTime = entry.date.getTime();
      if (entryTime < range.start.getTime() || entryTime > range.end.getTime()) return;
      const postingDate = getFridayPostingDate(entry.date);
      const key = projectionWeekKey(entry.employeeName, postingDate);
      const entries = actualByPostingDate.get(key) || [];
      entries.push(entry);
      actualByPostingDate.set(key, entries);
    });

    actualByPostingDate.forEach((entries) => {
      const first = entries[0];
      if (!first) return;
      const postingDate = getFridayPostingDate(first.date);
      const row = ensureRow(first.employeeName, postingDate);
      const buckets = getActualCategoryBuckets(entries);

      row.actualTotalHours = buckets.total;
      row.actualBillableHours = buckets.billable;
      row.actualOverheadHours = buckets.total - buckets.billable;
      row.actualAdminTrainingHours = buckets.adminTraining;
      row.actualBusinessDevelopmentHours = buckets.businessDevelopment;
      row.actualPplHolidayHours = buckets.pplHoliday;
      row.actualUtilization = buckets.total > 0 ? (buckets.billable / buckets.total) * 100 : null;
      row.originalEntries = entries;
    });

    data.projections.forEach((projection: ProjectionEntry) => {
      const postingDate = getFridayPostingDate(projection.date);
      const weekStart = startOfDay(new Date(postingDate.getFullYear(), postingDate.getMonth(), postingDate.getDate() - 6));
      if (postingDate.getTime() < range.start.getTime() || weekStart.getTime() > range.end.getTime()) return;

      const row = ensureRow(projection.employeeName, postingDate);
      const billable = projection.billableHours ?? projection.projectedHours ?? 0;
      const overhead = projection.overheadHours ?? 0;
      const total = projection.totalProjectedHours ?? billable + overhead;

      row.projectedBillableHours += billable;
      row.projectedOverheadHours += overhead;
      row.projectedAdminTrainingHours += projection.adminTrainingHours ?? 0;
      row.projectedBusinessDevelopmentHours += projection.businessDevelopmentHours ?? 0;
      row.projectedPplHolidayHours += projection.pplHolidayHours ?? 0;
      row.projectedOtherOverheadHours += projection.otherOverheadHours ?? 0;
      row.projectedTotalHours += total;
    });

    const search = employeeSearch.trim().toLowerCase();
    return Array.from(rowMap.values())
      .map(row => {
        const projectedDenominator = getProjectedUtilizationDenominator(row);
        const projectedUtilizationBillableHours = getProjectedUtilizationBillableHours(row);
        const projectedUtilization = projectedDenominator > 0
          ? (projectedUtilizationBillableHours / projectedDenominator) * 100
          : null;
        const actualUtilization = row.actualTotalHours > 0 ? (row.actualBillableHours / row.actualTotalHours) * 100 : null;

        return {
          ...row,
          projectedUtilization,
          actualUtilization,
          billableVariance: row.actualBillableHours - row.projectedBillableHours,
          overheadVariance: row.actualOverheadHours - row.projectedOverheadHours,
          targetVariance: projectedUtilization !== null && row.targetBillablePercentage !== null
            ? projectedUtilization - row.targetBillablePercentage
            : null,
          actualVariance: actualUtilization !== null && projectedUtilization !== null
            ? actualUtilization - projectedUtilization
            : null,
          utilizationVariance: actualUtilization !== null && projectedUtilization !== null
            ? actualUtilization - projectedUtilization
            : null
        };
      })
      .filter(row => !search || row.employeeName.toLowerCase().includes(search))
      .sort((a, b) => {
        const dateDiff = b.postingDate.getTime() - a.postingDate.getTime();
        if (dateDiff !== 0) return dateDiff;
        return a.employeeName.localeCompare(b.employeeName);
      });
  }, [data, employeeSearch, employeeTargets, range]);

  const rollupRows = useMemo<ProjectionRollupRow[]>(() => {
    const grouped = new Map<string, ProjectionComparisonRow[]>();

    comparisonRows.forEach(row => {
      const rows = grouped.get(row.employeeName) || [];
      rows.push(row);
      grouped.set(row.employeeName, rows);
    });

    return Array.from(grouped.entries())
      .map(([employeeName, weeklyRows]) => {
        const weekCount = Math.max(weeklyRows.length, 1);
        const totals = weeklyRows.reduce((acc, row) => {
          acc.actualTotalHours += row.actualTotalHours;
          acc.actualBillableHours += row.actualBillableHours;
          acc.actualOverheadHours += row.actualOverheadHours;
          acc.actualAdminTrainingHours += row.actualAdminTrainingHours;
          acc.actualBusinessDevelopmentHours += row.actualBusinessDevelopmentHours;
          acc.actualPplHolidayHours += row.actualPplHolidayHours;
          acc.projectedBillableHours += row.projectedBillableHours;
          acc.projectedOverheadHours += row.projectedOverheadHours;
          acc.projectedAdminTrainingHours += row.projectedAdminTrainingHours;
          acc.projectedBusinessDevelopmentHours += row.projectedBusinessDevelopmentHours;
          acc.projectedPplHolidayHours += row.projectedPplHolidayHours;
          acc.projectedOtherOverheadHours += row.projectedOtherOverheadHours;
          acc.projectedTotalHours += row.projectedTotalHours;
          acc.originalEntries.push(...row.originalEntries);
          return acc;
        }, {
          actualTotalHours: 0,
          actualBillableHours: 0,
          actualOverheadHours: 0,
          actualAdminTrainingHours: 0,
          actualBusinessDevelopmentHours: 0,
          actualPplHolidayHours: 0,
          projectedBillableHours: 0,
          projectedOverheadHours: 0,
          projectedAdminTrainingHours: 0,
          projectedBusinessDevelopmentHours: 0,
          projectedPplHolidayHours: 0,
          projectedOtherOverheadHours: 0,
          projectedTotalHours: 0,
          originalEntries: [] as TimesheetEntry[]
        });

        const averageProjectedBillable = totals.projectedBillableHours / weekCount;
        const averageProjectedOverhead = totals.projectedOverheadHours / weekCount;
        const averageProjectedTotal = totals.projectedTotalHours / weekCount;
        const averageActualBillable = totals.actualBillableHours / weekCount;
        const averageActualOverhead = totals.actualOverheadHours / weekCount;
        const averageActualTotal = totals.actualTotalHours / weekCount;
        const projectedUtilizationBillableHours = weeklyRows.reduce((sum, row) => sum + getProjectedUtilizationBillableHours(row), 0);
        const projectedUtilizationTotalHours = weeklyRows.reduce((sum, row) => sum + getProjectedUtilizationDenominator(row), 0);
        const projectedUtilization = projectedUtilizationTotalHours > 0
          ? (projectedUtilizationBillableHours / projectedUtilizationTotalHours) * 100
          : null;
        const actualUtilization = totals.actualTotalHours > 0
          ? (totals.actualBillableHours / totals.actualTotalHours) * 100
          : null;
        const targetBillablePercentage = getWeightedTarget(weeklyRows);
        const actualVariance = actualUtilization !== null && projectedUtilization !== null
          ? actualUtilization - projectedUtilization
          : null;
        const targetVariance = projectedUtilization !== null && targetBillablePercentage !== null
          ? projectedUtilization - targetBillablePercentage
          : null;

        return {
          key: employeeName,
          employeeName,
          weekCount,
          weeklyRows: weeklyRows.sort((a, b) => b.postingDate.getTime() - a.postingDate.getTime()),
          actualTotalHours: averageActualTotal,
          actualBillableHours: averageActualBillable,
          actualOverheadHours: averageActualOverhead,
          actualAdminTrainingHours: totals.actualAdminTrainingHours / weekCount,
          actualBusinessDevelopmentHours: totals.actualBusinessDevelopmentHours / weekCount,
          actualPplHolidayHours: totals.actualPplHolidayHours / weekCount,
          actualUtilization,
          projectedBillableHours: averageProjectedBillable,
          projectedOverheadHours: averageProjectedOverhead,
          projectedAdminTrainingHours: totals.projectedAdminTrainingHours / weekCount,
          projectedBusinessDevelopmentHours: totals.projectedBusinessDevelopmentHours / weekCount,
          projectedPplHolidayHours: totals.projectedPplHolidayHours / weekCount,
          projectedOtherOverheadHours: totals.projectedOtherOverheadHours / weekCount,
          projectedTotalHours: averageProjectedTotal,
          projectedUtilization,
          targetBillablePercentage,
          billableVariance: averageActualBillable - averageProjectedBillable,
          overheadVariance: averageActualOverhead - averageProjectedOverhead,
          targetVariance,
          actualVariance,
          utilizationVariance: actualUtilization !== null && projectedUtilization !== null
            ? actualUtilization - projectedUtilization
            : null,
          originalEntries: totals.originalEntries
        };
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [comparisonRows]);

  const aggregate = useMemo<ProjectionAggregate>(() => {
    return comparisonRows.reduce((acc, row) => {
      acc.actualTotalHours += row.actualTotalHours;
      acc.actualBillableHours += row.actualBillableHours;
      acc.actualOverheadHours += row.actualOverheadHours;
      acc.projectedBillableHours += row.projectedBillableHours;
      acc.projectedOverheadHours += row.projectedOverheadHours;
      acc.projectedTotalHours += row.projectedTotalHours;
      acc.projectedUtilizationBillableHours += getProjectedUtilizationBillableHours(row);
      acc.projectedUtilizationTotalHours += getProjectedUtilizationDenominator(row);
      if (row.targetBillablePercentage !== null) {
        const targetWeight = getTargetWeight(row);
        acc.targetWeightedTotal += row.targetBillablePercentage * targetWeight;
        acc.targetWeight += targetWeight;
      }
      if (row.actualTotalHours > 0 && row.projectedTotalHours > 0) acc.matchedRows++;
      acc.totalRows++;
      return acc;
    }, {
      actualTotalHours: 0,
      actualBillableHours: 0,
      actualOverheadHours: 0,
      projectedBillableHours: 0,
      projectedOverheadHours: 0,
      projectedTotalHours: 0,
      projectedUtilizationBillableHours: 0,
      projectedUtilizationTotalHours: 0,
      targetWeightedTotal: 0,
      targetWeight: 0,
      matchedRows: 0,
      totalRows: 0
    });
  }, [comparisonRows]);

  const actualUtilization = aggregate.actualTotalHours > 0
    ? (aggregate.actualBillableHours / aggregate.actualTotalHours) * 100
    : null;
  const projectedUtilization = aggregate.projectedUtilizationTotalHours > 0
    ? (aggregate.projectedUtilizationBillableHours / aggregate.projectedUtilizationTotalHours) * 100
    : null;
  const targetUtilization = aggregate.targetWeight > 0
    ? aggregate.targetWeightedTotal / aggregate.targetWeight
    : null;
  const utilizationVariance = actualUtilization !== null && projectedUtilization !== null
    ? actualUtilization - projectedUtilization
    : null;

  const openDrillDown = (entries: TimesheetEntry[]) => {
    setDrillDownEntries(entries);
    setIsModalOpen(true);
  };

  const toggleExpanded = (key: string) => {
    setExpandedEmployees(current => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!data) return null;

  return (
    <div className="container-fluid p-0">
      <DrillDownModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entries={drillDownEntries}
      />

      <div className="card mb-4 border-0 shadow-sm rounded-3">
        <div className="card-body p-4 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
          <div className="d-flex align-items-center">
            <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 me-3">
              <Table2 size={24} />
            </div>
            <div>
              <h4 className="fw-bold mb-0">Projections</h4>
              <p className="text-muted small mb-0">Projected utilization compared with actual timesheet results</p>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2" style={{ minWidth: '280px' }}>
            <input
              type="search"
              className="form-control form-control-sm"
              placeholder="Filter employee"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <ProjectionMetricCard
            title="Projected Util."
            value={percent(projectedUtilization)}
            icon={<CalendarClock size={20} />}
          />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <ProjectionMetricCard
            title="Actual Util."
            value={percent(actualUtilization)}
            icon={<CheckCircle2 size={20} />}
            color="text-success"
          />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <ProjectionMetricCard
            title="Util. Variance"
            value={signedPercent(utilizationVariance)}
            icon={<BarChart3 size={20} />}
            color={varianceClass(utilizationVariance)}
          />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <ProjectionMetricCard
            title="Target Util."
            value={percent(targetUtilization)}
            icon={<CircleAlert size={20} />}
            color="text-info"
          />
        </div>
      </div>

      <div className="card border-0 shadow-sm overflow-hidden">
        <div className="card-header bg-white border-bottom-0 pt-4 px-4 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-2">
          <div>
            <h6 className="metric-label mb-1">Projection Accuracy</h6>
            <div className="text-muted small">
              {range ? `${format(range.start, 'MMM d, yyyy')} - ${format(range.end, 'MMM d, yyyy')}` : 'All available dates'}
            </div>
          </div>
          <div className="text-muted small fw-medium">
            {rollupRows.length.toLocaleString()} employees / {comparisonRows.length.toLocaleString()} employee-week rows
          </div>
        </div>
        <div className="card-body p-0">
          {rollupRows.length === 0 ? (
            <div className="p-5 text-center">
              <div className="bg-light rounded-circle p-4 d-inline-flex mb-3">
                <Table2 size={36} className="text-secondary" />
              </div>
              <h5 className="fw-bold">No projection comparisons</h5>
              <p className="text-muted mb-0">No projection or timesheet rows fall inside the selected time window.</p>
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '70vh' }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light position-sticky top-0" style={{ zIndex: 1 }}>
                  <tr>
                    <th className="px-4 py-3 text-nowrap" style={{ width: '48px' }}></th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3 text-end text-nowrap">Forecast Billable %</th>
                    <th className="px-4 py-3 text-end text-nowrap">Target Billable %</th>
                    <th className="px-4 py-3 text-end text-nowrap">Forecast vs Target</th>
                    <th className="px-4 py-3 text-end text-nowrap">Actual Billable %</th>
                    <th className="px-4 py-3 text-end text-nowrap">Forecast Error</th>
                  </tr>
                </thead>
                <tbody>
                  {rollupRows.map(row => {
                    const isExpanded = expandedEmployees.has(row.key);
                    return (
                      <React.Fragment key={row.key}>
                        <ProjectionTableRow
                          row={row}
                          isRollup
                          isExpanded={isExpanded}
                          onToggle={() => toggleExpanded(row.key)}
                          onOpenDrillDown={openDrillDown}
                        />
                        {isExpanded && row.weeklyRows.map(weekRow => (
                          <ProjectionTableRow
                            key={weekRow.key}
                            row={weekRow}
                            onOpenDrillDown={openDrillDown}
                          />
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectionTableRow({
  row,
  isRollup = false,
  isExpanded = false,
  onToggle,
  onOpenDrillDown
}: {
  row: ProjectionComparisonRow | ProjectionRollupRow;
  isRollup?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  onOpenDrillDown: (entries: TimesheetEntry[]) => void;
}) {
  const weekLabel = 'postingDate' in row ? format(row.postingDate, 'MMM d, yyyy') : `${row.weekCount} weeks`;
  const labelDetail = 'weekCount' in row ? '' : row.employeeName;

  return (
    <tr className={isRollup ? 'projection-parent-row' : 'projection-week-row'}>
      <td className={`px-4 py-3 text-center ${isRollup ? '' : 'projection-week-gutter'}`}>
        {isRollup && (
          <button
            type="button"
            className="btn btn-sm btn-link text-decoration-none p-0 text-primary"
            onClick={onToggle}
            aria-label={isExpanded ? `Collapse ${row.employeeName}` : `Expand ${row.employeeName}`}
          >
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        )}
      </td>
      <td className={`px-4 py-3 ${isRollup ? '' : 'projection-week-label'}`}>
        <div className={`fw-bold d-flex align-items-center gap-2 ${isRollup ? '' : 'ps-3'}`}>
          <span>{isRollup ? row.employeeName : weekLabel}</span>
          {row.originalEntries.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-link text-decoration-none p-0 d-inline-flex align-items-center text-primary"
              onClick={() => onOpenDrillDown(row.originalEntries)}
              aria-label={`Open ${row.originalEntries.length} actual timesheet rows`}
            >
              <List size={14} />
            </button>
          )}
        </div>
        {labelDetail && <div className="text-muted small">{labelDetail}</div>}
      </td>
      <td className="px-4 py-3 text-end font-monospace">{percent(row.projectedUtilization)}</td>
      <td className="px-4 py-3 text-end font-monospace">{percent(row.targetBillablePercentage)}</td>
      <td className={`px-4 py-3 text-end font-monospace fw-bold ${varianceClass(row.targetVariance)}`}>
        {signedPercent(row.targetVariance)}
      </td>
      <td className="px-4 py-3 text-end font-monospace">{percent(row.actualUtilization)}</td>
      <td className={`px-4 py-3 text-end font-monospace fw-bold ${varianceClass(row.actualVariance)}`}>
        {signedPercent(row.actualVariance)}
      </td>
    </tr>
  );
}

function ProjectionMetricCard({
  title,
  value,
  icon,
  color = 'text-primary'
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body p-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div className={`rounded-3 p-2 bg-light ${color}`}>{icon}</div>
        </div>
        <div className="metric-label mb-1">{title}</div>
        <div className="h4 fw-bold mb-0 text-dark">{value}</div>
      </div>
    </div>
  );
}
