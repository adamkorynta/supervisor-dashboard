/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { buildWeeklyUtilizationTrend, getLatestCompletedDataDate } from './dashboardMetrics';
import { ProjectionEntry, TimesheetEntry } from '../types';

const entry = (date: Date): TimesheetEntry => ({
  id: date.toISOString(),
  employeeId: 'E1',
  employeeName: 'Alice',
  date,
  hours: 40,
  project: 'Client Work',
  category: 'Billable',
  billable: true
});

const projection = (date: Date): ProjectionEntry => ({
  employeeId: 'E1',
  employeeName: 'Alice',
  date,
  projectedHours: 40,
  billableHours: 32,
  overheadHours: 8,
  totalProjectedHours: 40
});

describe('dashboardMetrics', () => {
  it('caps latest completed data at the most recent Friday when future posting rows exist', () => {
    const latest = getLatestCompletedDataDate(
      [
        entry(new Date(2026, 6, 10)),
        entry(new Date(2026, 6, 17))
      ],
      new Date(2026, 6, 14)
    );

    expect(latest?.toISOString().slice(0, 10)).toBe('2026-07-10');
  });

  it('includes four future projection weeks when the selected range includes the latest data', () => {
    const latestDataDate = new Date(2026, 0, 2);
    const rows = buildWeeklyUtilizationTrend(
      [entry(latestDataDate)],
      [
        projection(new Date(2026, 0, 9)),
        projection(new Date(2026, 0, 16)),
        projection(new Date(2026, 0, 23)),
        projection(new Date(2026, 0, 30)),
        projection(new Date(2026, 1, 6))
      ],
      { start: new Date(2025, 11, 27), end: latestDataDate },
      new Map([['Alice', 75]]),
      { latestDataDate }
    );

    expect(rows.map(row => row.date)).toEqual([
      '2026-01-02',
      '2026-01-09',
      '2026-01-16',
      '2026-01-23',
      '2026-01-30'
    ]);
    expect(rows.slice(1).every(row => row.projection === 80)).toBe(true);
  });

  it('does not extend projection weeks for a historical range that excludes the latest data', () => {
    const rows = buildWeeklyUtilizationTrend(
      [entry(new Date(2025, 11, 5))],
      [projection(new Date(2026, 0, 9))],
      { start: new Date(2025, 10, 29), end: new Date(2025, 11, 5) },
      new Map([['Alice', 75]]),
      { latestDataDate: new Date(2026, 0, 2) }
    );

    expect(rows.map(row => row.date)).toEqual(['2025-12-05']);
  });
});
