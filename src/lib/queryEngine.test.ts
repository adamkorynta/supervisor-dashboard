/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { queryData } from './queryEngine';
import { 
  TimesheetEntry, 
  ADMIN_PROJECT_NAME_REGEX, 
  ADMIN_PROJECT_CODE_REGEX, 
  BIZ_DEV_PROJECT_NAME_REGEX, 
  BIZ_DEV_PROJECT_CODE_REGEX 
} from '../types';
import { startOfDay, endOfDay, format } from 'date-fns';

describe('queryEngine', () => {
  const mockData: TimesheetEntry[] = [
    { id: '1', employeeId: 'E1', employeeName: 'Alice', date: new Date('2026-01-01'), hours: 8, project: 'Admin Task', projectName: 'Admin Task', projectCode: '', billable: false, category: 'Admin' },
    { id: '2', employeeId: 'E1', employeeName: 'Alice', date: new Date('2026-01-02'), hours: 8, project: 'PPL Time', projectName: 'PPL Time', projectCode: '', billable: false, category: 'PPL' },
    { id: '3', employeeId: 'E2', employeeName: 'Bob', date: new Date('2026-01-01'), hours: 8, project: 'PROPOSAL | New Bridge', projectName: 'New Bridge', projectCode: '610025', billable: false, category: 'BizDev' },
    { id: '4', employeeId: 'E2', employeeName: 'Bob', date: new Date('2026-01-02'), hours: 8, project: 'Business Development', projectName: 'Business Development', projectCode: '', billable: false, category: 'BizDev' },
    { id: '5', employeeId: 'E3', employeeName: 'Charlie', date: new Date('2026-01-01'), hours: 8, project: '601 | Project', projectName: 'Project', projectCode: '601', billable: false, category: 'Holiday' },
    { id: '6', employeeId: 'E3', employeeName: 'Charlie', date: new Date('2026-01-02'), hours: 8, project: 'Task 650', projectName: 'Task 650', projectCode: '650', billable: false, category: 'Admin' },
    { id: '7', employeeId: 'E4', employeeName: 'Diana', date: new Date('2026-01-01'), hours: 8, project: '610025 | NewBiz', projectName: 'NewBiz', projectCode: '610025', billable: false, category: 'BizDev' },
    { id: '8', employeeId: 'E5', employeeName: 'Eve', date: new Date('2026-01-01'), hours: 10, project: 'Corporate (exp 7491)', projectName: 'Corporate (exp 7491)', projectCode: '', billable: false, category: 'Corporate' },
  ];

  it('should support regex operator for filtering using separate constants', () => {
    const adminNameRegex = new RegExp(ADMIN_PROJECT_NAME_REGEX, 'i');
    const adminCodeRegex = new RegExp(ADMIN_PROJECT_CODE_REGEX, 'i');
    const bizDevNameRegex = new RegExp(BIZ_DEV_PROJECT_NAME_REGEX, 'i');
    const bizDevCodeRegex = new RegExp(BIZ_DEV_PROJECT_CODE_REGEX, 'i');
    
    // Debug: Check regex matches
    /*
    mockData.forEach(e => {
      console.log(`Entry: ${e.project}, Name: ${e.projectName}, Code: ${e.projectCode}`);
      console.log(`  BizDev Name Match: ${bizDevNameRegex.test(e.projectName || '')}`);
      console.log(`  BizDev Code Match: ${bizDevCodeRegex.test(e.projectCode || '')}`);
    });
    */

    // Test BizDev first
    const bizDevFiltered = mockData.filter(e => 
      bizDevNameRegex.test(e.projectName || '') || bizDevCodeRegex.test(e.projectCode || '')
    );
    
    // Expecting:
    // Entry 3: PROPOSAL (Name match) - 8h
    // Entry 4: Business Development (Name match) - 8h
    // Entry 7: 610025 (Code match) - 8h
    // Total = 24h
    
    const bizDevResults = queryData(bizDevFiltered, { metrics: ['totalHours'] });
    expect(bizDevResults[0].totalHours).toBe(24);

    // Test Admin with BizDev exclusion
    const adminFiltered = mockData.filter(e => {
      const pName = e.projectName || '';
      const pCode = e.projectCode || '';
      if (bizDevNameRegex.test(pName) || bizDevCodeRegex.test(pCode)) return false;
      return adminNameRegex.test(pName) || adminCodeRegex.test(pCode);
    });
    const adminResults = queryData(adminFiltered, { metrics: ['totalHours'] });

    // Alice has 8h Admin + 8h PPL = 16h
    // Charlie has 8h 601 + 8h 650 = 16h
    // Diana has 8h 610025 = 0h (excluded as BizDev)
    // Total = 32h
    expect(adminResults[0].totalHours).toBe(32);
  });

  it('should be case-insensitive with regex operator', () => {
    const results = queryData(mockData, {
      metrics: ['totalHours'],
      filters: [{ field: 'project', operator: 'regex', value: 'admin' }]
    });

    expect(results[0].totalHours).toBe(8);
  });

  it('should filter by time range', () => {
    const timeRange = {
      start: startOfDay(new Date('2026-01-01')),
      end: endOfDay(new Date('2026-01-01'))
    };

    const results = queryData(mockData, {
      metrics: ['totalHours'],
      timeRange
    });

    // 5 entries on 2026-01-01 (Alice, Bob, Charlie, Diana, Eve)
    // 8+8+8+8+10 = 42h
    expect(results[0].totalHours).toBe(42);
  });

  it('should include boundary dates in time range', () => {
    const date = new Date('2026-01-01');
    const timeRange = {
      start: date,
      end: date
    };

    // We need to ensure mock data also uses the same "today" if we want exact match, 
    // or use startOfDay for both.
    const results = queryData(mockData, {
      metrics: ['totalHours'],
      timeRange: {
        start: startOfDay(mockData[0].date),
        end: endOfDay(mockData[0].date)
      }
    });

    expect(results[0].totalHours).toBe(42);
  });

  it('should calculate Last Week correctly based on the new definition (Saturday to Friday)', () => {
    // Reference date: Wednesday 2026-04-22
    // Friday should be 2026-04-17
    // Saturday should be 2026-04-11
    const reference = new Date(2026, 3, 22, 12, 0, 0); // April 22
    
    const day = reference.getDay(); // 3 (Wed)
    const diffToFriday = (day + 2) % 7; 
    
    const friday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    friday.setDate(friday.getDate() - diffToFriday);
    
    const saturday = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate());
    saturday.setDate(friday.getDate() - 6);

    expect(friday.getDay()).toBe(5); // Friday
    expect(saturday.getDay()).toBe(6); // Saturday
    expect(format(friday, 'yyyy-MM-dd')).toBe('2026-04-17');
    expect(format(saturday, 'yyyy-MM-dd')).toBe('2026-04-11');
  });

  it('should debug the user reported case: April 23 2026 showing April 4 to April 10', () => {
    // Today: Thursday April 23, 2026
    // Expected: April 11 to April 17
    // Reported: April 4 to April 10
    const reference = new Date(2026, 3, 23, 12, 0, 0); // April 23
    const day = reference.getDay(); // 4 (Thu)
    
    const diffToFriday = (day + 2) % 7;
    const friday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    friday.setDate(friday.getDate() - diffToFriday);
    
    const saturday = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate());
    saturday.setDate(friday.getDate() - 6);

    expect(format(friday, 'yyyy-MM-dd')).toBe('2026-04-17');
    expect(format(saturday, 'yyyy-MM-dd')).toBe('2026-04-11');
  });

  it('should handle Friday as reference date for Last Week and return the week ending ON that Friday', () => {
    // Reference date: Friday 2026-04-24
    // Should return the week of Apr 18 - Apr 24
    const reference = new Date(2026, 3, 24, 12, 0, 0); // April 24
    
    const day = reference.getDay(); // 5 (Fri)
    const diffToFriday = (day + 2) % 7; 
    
    const friday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    friday.setDate(friday.getDate() - diffToFriday);
    
    const saturday = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate());
    saturday.setDate(friday.getDate() - 6);

    expect(friday.getDay()).toBe(5); 
    expect(format(friday, 'yyyy-MM-dd')).toBe('2026-04-24');
    expect(format(saturday, 'yyyy-MM-dd')).toBe('2026-04-18');
  });

  it('should return raw entries if no metrics or groupBy are provided', () => {
    const results = queryData(mockData, { metrics: [] });
    expect(results).toHaveLength(mockData.length);
    expect(results[0]).toHaveProperty('employeeName');
  });

  it('should calculate revised utilization correctly', () => {
    const billableEntry: TimesheetEntry = { id: '9', employeeId: 'E6', employeeName: 'Frank', date: new Date('2026-01-01'), hours: 40, project: 'Client', projectName: 'Client', projectCode: '', billable: true, category: 'Billable' };
    const corporateEntry: TimesheetEntry = { id: '10', employeeId: 'E6', employeeName: 'Frank', date: new Date('2026-01-01'), hours: 10, project: 'Corp (exp 7491)', projectName: 'Corp (exp 7491)', projectCode: '', billable: false, category: 'Corporate' };
    const adminEntry: TimesheetEntry = { id: '11', employeeId: 'E6', employeeName: 'Frank', date: new Date('2026-01-01'), hours: 50, project: 'Admin', projectName: 'Admin', projectCode: '', billable: false, category: 'Admin' };
    
    const data = [billableEntry, corporateEntry, adminEntry]; // Total 100h
    
    const results = queryData(data, { metrics: ['billablePercentage', 'revisedUtilization'] });
    
    // Billable: 40/100 = 40%
    // Revised: (40 + 10) / 100 = 50%
    expect(results[0].billablePercentage).toBe(40);
    expect(results[0].revisedUtilization).toBe(50);
  });

  it('should calculate business development percentage correctly', () => {
    const results = queryData(mockData, { metrics: ['totalHours', 'bizDevPercentage'] });

    // BizDev: 24h / 66h total
    expect(results[0].totalHours).toBe(66);
    expect(results[0].bizDevPercentage).toBeCloseTo(36.36, 2);
  });

  it('should group by category and calculate totalHours', () => {
    const results = queryData(mockData, {
      groupBy: 'category',
      metrics: ['totalHours']
    });

    expect(results).toHaveLength(5); // Admin, PPL, Holiday, BizDev, Corporate
    
    const admin = results.find(r => r.category === 'Admin');
    const ppl = results.find(r => r.category === 'PPL');
    const holiday = results.find(r => r.category === 'Holiday');
    const bizDev = results.find(r => r.category === 'BizDev');
    const corporate = results.find(r => r.category === 'Corporate');

    expect(admin.totalHours).toBe(16); // Entry 1 (8), 6 (8)
    expect(ppl.totalHours).toBe(8); // Entry 2 (8)
    expect(holiday.totalHours).toBe(8); // Entry 5 (8)
    expect(bizDev.totalHours).toBe(24); // Entry 3 (8), 4 (8), 7 (8)
    expect(corporate.totalHours).toBe(10); // Entry 8 (10)
  });
});
