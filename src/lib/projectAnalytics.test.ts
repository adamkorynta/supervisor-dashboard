/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { buildContributorEffortData, buildFundingRemainingTimeSeries, buildProjectSummary, buildProjectTaskSummaries, buildProjectTimeSeries, buildTaskEffortTimeSeries, buildTaskFundingRemainingTimeSeries, naturalCompare } from './projectAnalytics';
import { ProjectSnapshot, TimesheetEntry } from '../types';

describe('project analytics', () => {
  const project: ProjectSnapshot = {
    id: 'project-2400035',
    projectCode: '2400035',
    projectName: 'Flood Management On-Call Services',
    budgetHours: 1000,
    tasks: [
      {
        id: 'task-1',
        name: 'Update Supplement C of the DFEMP',
        code: '1',
        budgetHours: 600
      },
      {
        id: 'task-2',
        name: 'Update and Expand Functionality in the Delta ERT',
        code: '2',
        budgetHours: 400
      }
    ],
    raw: {}
  };

  const baseEntry: TimesheetEntry = {
    id: 'entry-1',
    employeeId: '',
    employeeName: 'Adam N Korynta',
    date: new Date('2026-05-08'),
    hours: 1,
    project: 'Flood Management On-Call Services',
    projectCode: '2400035',
    projectName: 'Flood Management On-Call Services',
    category: 'Billable',
    billable: true,
    cost: 100
  };

  it('builds task summaries from snapshot tasks and matches timesheet rows by task code or task name', () => {
    const summaries = buildProjectTaskSummaries(project, [
      { ...baseEntry, id: 'entry-1', taskCode: '1', cost: 100 },
      { ...baseEntry, id: 'entry-2', taskCode: '2', taskName: 'Update and Expand Functionality in the Delta ERT', cost: 250 },
      { ...baseEntry, id: 'entry-3', taskCode: '9', taskName: 'Timesheet-only description', cost: 999 }
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries.find(task => task.taskCode === '1')).toEqual(expect.objectContaining({
      taskName: 'Update Supplement C of the DFEMP',
      effortSpent: 100,
      budgetHours: 600,
      weeksUntilBudgetExhausted: 5,
      budgetExhaustionDate: expect.any(Date),
      weeklyBurnRate: 100,
      monthlyBurnRate: 100
    }));
    expect(summaries.find(task => task.taskCode === '2')).toEqual(expect.objectContaining({
      taskName: 'Update and Expand Functionality in the Delta ERT',
      effortSpent: 250,
      budgetHours: 400
    }));
    expect(summaries.some(task => task.taskName === 'Timesheet-only description')).toBe(false);
  });

  it('does not match duplicate task codes when task names do not match', () => {
    const duplicateCodeProject: ProjectSnapshot = {
      ...project,
      tasks: [
        { id: 'task-a', name: 'First task', code: '1', budgetHours: 100 },
        { id: 'task-b', name: 'Second task', code: '1', budgetHours: 100 }
      ]
    };

    const summaries = buildProjectTaskSummaries(duplicateCodeProject, [
      { ...baseEntry, id: 'entry-1', taskCode: '1', cost: 100 }
    ]);

    expect(summaries[0].effortSpent).toBe(0);
    expect(summaries[1].effortSpent).toBe(0);
  });

  it('filters persisted rollup task rows from task summaries', () => {
    const projectWithRollup: ProjectSnapshot = {
      ...project,
      tasks: [
        { id: 'rollup', name: 'Professional Services', code: '1', budgetHours: 1000 },
        { id: 'task-1', name: 'Concrete Task', code: '1A', budgetHours: 100 }
      ]
    };

    const summaries = buildProjectTaskSummaries(projectWithRollup, []);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].taskName).toBe('Concrete Task');
  });

  it('keeps a rollup task when it is the only available task row', () => {
    const projectWithOnlyRollup: ProjectSnapshot = {
      ...project,
      tasks: [
        { id: 'rollup', name: 'Professional Services', code: '1', budgetHours: 1000 }
      ]
    };

    const summaries = buildProjectTaskSummaries(projectWithOnlyRollup, []);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].taskName).toBe('Professional Services');
  });

  it('uses timesheet task rows when the snapshot only has a project total fallback', () => {
    const projectWithOnlyTotal: ProjectSnapshot = {
      ...project,
      tasks: [
        { id: 'project-total', name: 'Project Total', budgetHours: 1000 }
      ]
    };

    const summaries = buildProjectTaskSummaries(projectWithOnlyTotal, [
      { ...baseEntry, id: 'entry-1', taskCode: '1', taskName: 'WRIMS 3', cost: 250 },
      { ...baseEntry, id: 'entry-2', taskCode: '3', taskName: 'CalLite', cost: 100 },
      { ...baseEntry, id: 'entry-3', taskCode: '4', taskName: 'EPPT', cost: 75 }
    ]);

    expect(summaries.map(task => task.taskName)).toEqual(['CalLite', 'EPPT', 'WRIMS 3']);
    expect(summaries.find(task => task.taskName === 'WRIMS 3')).toEqual(expect.objectContaining({
      taskCode: '1',
      effortSpent: 250,
      budgetHours: 0
    }));
    expect(summaries.some(task => task.taskName === 'Project Total')).toBe(false);
  });

  it('does not mark projects or tasks over budget within the tolerance', () => {
    const projectSummary = buildProjectSummary(project, [
      { ...baseEntry, id: 'entry-1', cost: 1200 }
    ]);
    const taskSummary = buildProjectTaskSummaries(project, [
      { ...baseEntry, id: 'entry-2', taskCode: '1', cost: 800 }
    ])[0];

    expect(projectSummary.risk).not.toBe('over-budget');
    expect(taskSummary.risk).not.toBe('over-budget');
  });

  it('uses exponentially weighted weekly burn for task runway forecasts', () => {
    const weightedProject: ProjectSnapshot = {
      ...project,
      tasks: [
        { id: 'task-1', name: 'Update Supplement C of the DFEMP', code: '1', budgetHours: 1000 }
      ]
    };
    const taskSummary = buildProjectTaskSummaries(weightedProject, [
      { ...baseEntry, id: 'entry-1', date: new Date('2026-01-15'), taskCode: '1', cost: 400 },
      { ...baseEntry, id: 'entry-2', date: new Date('2026-02-15'), taskCode: '1', cost: 100 }
    ])[0];

    expect(taskSummary.weeklyBurnRate).toBe(250);
    expect(taskSummary.weightedWeeklyBurnRate).toBeLessThan(taskSummary.weeklyBurnRate);
    expect(taskSummary.weeksUntilBudgetExhausted).toBeGreaterThan(2);
  });

  it('marks projects over budget when the tolerance is exceeded', () => {
    const projectSummary = buildProjectSummary(project, [
      { ...baseEntry, id: 'entry-1', cost: 1500 }
    ]);

    expect(projectSummary.risk).toBe('over-budget');
  });

  it('builds contributor effort mix data using cost effort', () => {
    const contributors = buildContributorEffortData([
      { ...baseEntry, id: 'entry-1', employeeName: 'Adam N Korynta', cost: 100 },
      { ...baseEntry, id: 'entry-2', employeeName: 'Adam N Korynta', cost: 250 },
      { ...baseEntry, id: 'entry-3', employeeName: 'Ryan D Ripken', cost: 500 }
    ]);

    expect(contributors).toEqual([
      { employeeName: 'Ryan D Ripken', effort: 500, originalEntries: expect.any(Array) },
      { employeeName: 'Adam N Korynta', effort: 350, originalEntries: expect.any(Array) }
    ]);
  });

  it('builds funding remaining over time from cumulative spend', () => {
    const series = buildFundingRemainingTimeSeries(project, [
      { ...baseEntry, id: 'entry-1', date: new Date('2026-01-15'), cost: 100 },
      { ...baseEntry, id: 'entry-2', date: new Date('2026-02-15'), cost: 250 }
    ]);

    expect(series.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ month: '2026-01', remaining: 900, cumulativeSpend: 100 }),
      expect.objectContaining({ month: '2026-02', remaining: 650, cumulativeSpend: 350 })
    ]));
    expect(series.series).toEqual(expect.arrayContaining([
      'remaining',
      'trendline'
    ]));
  });

  it('builds project effort time series with only total and trendline', () => {
    const series = buildProjectTimeSeries(project, [
      { ...baseEntry, id: 'entry-1', date: new Date('2026-01-15'), taskCode: '1', cost: 100 },
      { ...baseEntry, id: 'entry-2', date: new Date('2026-02-15'), taskCode: '2', cost: 250 }
    ]);

    expect(series.series).toEqual(['total', 'trendline']);
    expect(series.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ month: '2026-01', total: 100, trendline: expect.any(Number) }),
      expect.objectContaining({ month: '2026-02', total: 250, trendline: expect.any(Number) })
    ]));
    expect(series.rows.some(row => 'Update Supplement C of the DFEMP' in row)).toBe(false);
  });

  it('builds separate weekly task effort series with task trendlines', () => {
    const taskSeries = buildTaskEffortTimeSeries(project, [
      { ...baseEntry, id: 'entry-1', date: new Date('2026-01-15'), taskCode: '1', cost: 100 },
      { ...baseEntry, id: 'entry-2', date: new Date('2026-02-15'), taskCode: '1', cost: 150 },
      { ...baseEntry, id: 'entry-3', date: new Date('2026-02-20'), taskCode: '2', taskName: 'Update and Expand Functionality in the Delta ERT', cost: 50 }
    ]);

    const firstTask = taskSeries.find(task => task.taskCode === '1');
    const secondTask = taskSeries.find(task => task.taskCode === '2');

    expect(taskSeries).toHaveLength(2);
    expect(firstTask).toEqual(expect.objectContaining({
      taskName: 'Update Supplement C of the DFEMP',
      series: ['total', 'trendline']
    }));
    expect(firstTask?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ week: '2026-01-12', total: 100, trendline: expect.any(Number) }),
      expect.objectContaining({ week: '2026-01-19', total: 0, trendline: expect.any(Number) }),
      expect.objectContaining({ week: '2026-01-26', total: 0, trendline: expect.any(Number) }),
      expect.objectContaining({ week: '2026-02-02', total: 0, trendline: expect.any(Number) }),
      expect.objectContaining({ week: '2026-02-09', total: 150, trendline: expect.any(Number) })
    ]));
    expect(secondTask?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ week: '2026-02-16', total: 50, trendline: expect.any(Number) })
    ]));
  });

  it('builds separate weekly task funding remaining series with task trendlines', () => {
    const taskSeries = buildTaskFundingRemainingTimeSeries(project, [
      { ...baseEntry, id: 'entry-1', date: new Date('2026-01-15'), taskCode: '1', cost: 100 },
      { ...baseEntry, id: 'entry-2', date: new Date('2026-02-15'), taskCode: '1', cost: 150 },
      { ...baseEntry, id: 'entry-3', date: new Date('2026-02-20'), taskCode: '2', taskName: 'Update and Expand Functionality in the Delta ERT', cost: 50 }
    ]);

    expect(taskSeries).toHaveLength(2);
    const firstTask = taskSeries.find(task => task.taskCode === '1');
    const secondTask = taskSeries.find(task => task.taskCode === '2');

    expect(firstTask).toEqual(expect.objectContaining({
      taskName: 'Update Supplement C of the DFEMP',
      series: ['remaining', 'trendline']
    }));
    expect(firstTask?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ week: '2026-01-12', remaining: 500, cumulativeSpend: 100 }),
      expect.objectContaining({ week: '2026-01-19', remaining: 500, cumulativeSpend: 100, weeklySpend: 0 }),
      expect.objectContaining({ week: '2026-01-26', remaining: 500, cumulativeSpend: 100, weeklySpend: 0 }),
      expect.objectContaining({ week: '2026-02-02', remaining: 500, cumulativeSpend: 100, weeklySpend: 0 }),
      expect.objectContaining({ week: '2026-02-09', remaining: 350, cumulativeSpend: 250, trendline: expect.any(Number) })
    ]));
    expect(secondTask?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ week: '2026-02-16', remaining: 350, cumulativeSpend: 50, trendline: expect.any(Number) })
    ]));
  });

  it('correctly sorts task names naturally (alphanumerically)', () => {
    const taskNames = ['CLIN 6001', 'CLIN 2001', 'CLIN 10001', 'CLIN 2002'];
    const sorted = [...taskNames].sort(naturalCompare);
    expect(sorted).toEqual(['CLIN 2001', 'CLIN 2002', 'CLIN 6001', 'CLIN 10001']);
  });
});
