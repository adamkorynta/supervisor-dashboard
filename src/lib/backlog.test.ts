
import { normalizeProjectSchedules } from './normalization';
import { buildBacklogCurves } from './projectAnalytics';

describe('Project Schedule Normalization', () => {
  it('should normalize project schedule rows correctly', () => {
    const rawData = [
      {
        'Task ID': 'T1',
        'Task Name': 'Design',
        'Start Date': '2026-01-01',
        'End Date': '2026-03-01',
        'Labor Hours': '100',
        'Cost ($)': '5000',
        'Project Code': 'P101'
      },
      {
        'Task ID': 'T2',
        'Task Name': 'Development',
        'Start Date': '2026-03-01',
        'End Date': '2026-06-01',
        'Labor Hours': '200',
        'Cost ($)': '10000',
        'Project Code': 'P101'
      }
    ];

    const normalized = normalizeProjectSchedules(rawData);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].taskId).toBe('T1');
    expect(normalized[0].taskName).toBe('Design');
    expect(normalized[0].cost).toBe(5000);
    expect(normalized[0].projectCode).toBe('P101');
    expect(normalized[0].startDate).toBeInstanceOf(Date);
    expect(normalized[1].endDate).toBeInstanceOf(Date);
  });
});

describe('Backlog Curve Generation', () => {
  it('should build backlog curves from schedules and entries', () => {
    const schedules = [
      {
        taskId: 'T1',
        taskName: 'Design',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        durationDays: 365,
        laborHours: 1000,
        cost: 50000,
        projectCode: 'P101'
      }
    ];

    const entries = [
      {
        id: '1',
        employeeId: 'E1',
        employeeName: 'Alice',
        date: new Date('2026-06-01'),
        hours: 40,
        project: 'Project 101',
        projectCode: 'P101',
        category: 'Billable' as const,
        billable: true,
        cost: 2000
      }
    ];

    const curves = buildBacklogCurves(schedules, entries);

    expect(curves).toHaveLength(1);
    expect(curves[0].projectCode).toBe('P101');
    expect(curves[0].totalLaborRemaining).toBe(50000);
    expect(curves[0].series.length).toBeGreaterThan(0);
    
    // Check for actual cost data
    // The dates might be affected by timezone, so we should look for a point that has actualCost
    const historicalPoint = curves[0].series.find(p => p.actualCost === 2000);
    expect(historicalPoint).toBeDefined();
    expect(historicalPoint?.cumulativeActualCost).toBe(2000);
    
    // Last point should be zero
    const lastPoint = curves[0].series[curves[0].series.length - 1];
    expect(lastPoint.backlogRemaining).toBe(0);
    
    // Burn rate should be calculated
    expect(curves[0].burnRate).toBeGreaterThan(0);
  });

  it('should match projects by name when code is missing', () => {
    const schedules = [
      {
        taskId: 'T1',
        taskName: 'Design',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        durationDays: 365,
        laborHours: 1000,
        cost: 50000,
        projectName: 'Alpha Project'
      }
    ];

    const entries = [
      {
        id: '1',
        employeeId: 'E1',
        employeeName: 'Alice',
        date: new Date('2026-06-01'),
        hours: 40,
        project: 'Alpha Project',
        category: 'Billable' as const,
        billable: true,
        cost: 2000
      }
    ];

    const curves = buildBacklogCurves(schedules, entries);

    expect(curves).toHaveLength(1);
    expect(curves[0].projectName).toBe('Alpha Project');
    expect(curves[0].burnRate).toBeGreaterThan(0);
  });
});
