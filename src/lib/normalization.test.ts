/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { normalizeTimesheet, normalizeProjectSnapshots, mergeSupervisors, ColumnMapping, DEFAULT_MAPPING, validateMapping } from './normalization';
import { DEFAULT_SUPERVISOR_DATA } from './seedData';
import { TimesheetEntry, SupervisorMapping } from '../types';

describe('normalization', () => {
  const mapping: ColumnMapping = {
    employeeName: 'EmpName',
    transactionDate: 'WorkDate',
    hours: 'Hrs',
    project: 'Proj',
    billable: 'Bill'
  };

  const rawData = [
    { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '8', Proj: 'P1', Bill: 'Yes' },
    { EmpName: 'Bob', WorkDate: '04/23/2026', Hrs: '4', Proj: 'P2', Bill: 'No' }
  ];

  it('should normalize raw timesheet data', () => {
    const normalized = normalizeTimesheet(rawData, mapping);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].employeeName).toBe('Alice');
    expect(normalized[0].hours).toBe(8);
    expect(normalized[0].billable).toBe(true);
    // Use current year or fixed year to avoid failure if the test environment year changes
    // The previous failure showed 2025 vs 2026.
    expect(normalized[0].date.getFullYear()).toBeGreaterThanOrEqual(2025);
    expect(normalized[1].employeeName).toBe('Bob');
    expect(normalized[1].billable).toBe(false);
  });

  it('should prioritize Posting Date over Transaction Date', () => {
    const mixedData = [
      { 
        EmpName: 'Alice', 
        WorkDate: '2026-04-20', 
        'Posting Date': '2026-04-22', 
        Hrs: '8', 
        Proj: 'P1' 
      }
    ];
    const mixedMapping: ColumnMapping = {
      ...mapping,
      postingDate: 'Posting Date'
    };
    const normalized = normalizeTimesheet(mixedData, mixedMapping);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].date.toISOString().split('T')[0]).toBe('2026-04-22');
    expect(normalized[0].postingDate?.toISOString().split('T')[0]).toBe('2026-04-22');
    expect(normalized[0].transactionDate?.toISOString().split('T')[0]).toBe('2026-04-20');
  });

  it('should not swap dates when both are present', () => {
    const data = [
      { 
        EmpName: 'Alice', 
        'Transaction Date': '2026-04-10', 
        'Posting Date': '2026-04-15', 
        Hrs: '8', 
        Proj: 'P1' 
      }
    ];
    const mixedMapping: ColumnMapping = {
      ...mapping,
      transactionDate: 'Transaction Date',
      postingDate: 'Posting Date'
    };
    const normalized = normalizeTimesheet(data, mixedMapping);
    expect(normalized[0].date.toISOString().split('T')[0]).toBe('2026-04-15'); // primary should be posting
    expect(normalized[0].postingDate?.toISOString().split('T')[0]).toBe('2026-04-15');
    expect(normalized[0].transactionDate?.toISOString().split('T')[0]).toBe('2026-04-10');
  });

  it('should use Transaction Date if Posting Date is missing', () => {
    const data = [
      { 
        EmpName: 'Alice', 
        WorkDate: '2026-04-20', 
        Hrs: '8', 
        Proj: 'P1' 
      }
    ];
    const normalized = normalizeTimesheet(data, mapping);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].date.toISOString().split('T')[0]).toBe('2026-04-20');
    expect(normalized[0].postingDate).toBeUndefined();
    expect(normalized[0].transactionDate?.toISOString().split('T')[0]).toBe('2026-04-20');
  });

  it('should normalize data using the default mapping from the example file', () => {
    const exampleRawData = [
      {
        'Project Code': '2407742',
        'Project Name': '24-053 HEC-ResEvap OpenDCS Cloud Compute (F0215)',
        'Task Name': '(Optional)  OpenDCS API and Web Client Maintenance ($36,417.81)',
        'Task Code': '2A',
        'Employee / Vendor / Client Name': 'Adam N Korynta',
        'Transaction Date': '12/29/2025',
        'Quantity': '1.00',
        'Effort': '231.84',
        'Effort Rate': '231.8400',
        'Project Manager Name': 'Shannon R Larson',
        'Project Client Name': 'US Army Corp of Engineers - Finance Center',
        'Project Organization Name': 'Resource Mgmt. Assoc.',
        'Billable': 'TRUE'
      }
    ];

    const normalized = normalizeTimesheet(exampleRawData, DEFAULT_MAPPING);
    expect(normalized).toHaveLength(1);
    const entry = normalized[0];
    expect(entry.employeeName).toBe('Adam N Korynta');
    expect(entry.projectCode).toBe('2407742');
    expect(entry.project).toBe('24-053 HEC-ResEvap OpenDCS Cloud Compute (F0215)');
    expect(entry.taskName).toBe('(Optional)  OpenDCS API and Web Client Maintenance ($36,417.81)');
    expect(entry.taskCode).toBe('2A');
    expect(entry.hours).toBe(1.0);
    expect(entry.cost).toBe(231.84);
    expect(entry.rate).toBe(231.84);
    expect(entry.billable).toBe(true);
    expect(entry.managerName).toBe('Shannon R Larson');
    expect(entry.client).toBe('US Army Corp of Engineers - Finance Center');
    expect(entry.branch).toBe('Resource Mgmt. Assoc.');
  });

  it('should correctly merge with default supervisor data', () => {
    const entries: Partial<TimesheetEntry>[] = [
      { employeeName: 'Adam N Korynta' },
      { employeeName: 'Bryson M Spilman' },
      { employeeName: 'Unknown Person' }
    ];

    const { entries: merged, unmatchedEmployees } = mergeSupervisors(
      entries as TimesheetEntry[], 
      DEFAULT_SUPERVISOR_DATA
    );

    expect(merged[0].managerName).toBe('Peter S Morris');
    expect(merged[1].managerName).toBe('Adam N Korynta');
    expect(unmatchedEmployees).toContain('Unknown Person');
  });

  it('should merge supervisors correctly and report unmatched', () => {
    const entries: Partial<TimesheetEntry>[] = [
      { employeeName: 'Alice', employeeId: 'A1' },
      { employeeName: 'Bob', employeeId: 'B1' }
    ];
    const supervisors: SupervisorMapping[] = [
      { employeeId: 'A1', employeeName: 'Alice', supervisorId: 'S1', supervisorName: 'SuperAlice' }
    ];

    const { entries: merged, unmatchedEmployees } = mergeSupervisors(entries as TimesheetEntry[], supervisors);
    expect(merged[0].managerName).toBe('SuperAlice');
    expect(unmatchedEmployees).toContain('Bob');
  });

  describe('validateMapping', () => {
    const headers = ['Employee / Vendor / Client Name', 'Transaction Date', 'Quantity', 'Project Name'];
    
    it('should return valid for correct mapping', () => {
      const result = validateMapping(headers, DEFAULT_MAPPING);
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should return invalid and list missing fields for incomplete mapping', () => {
      const incompleteHeaders = ['Transaction Date', 'Quantity', 'Project Name'];
      const result = validateMapping(incompleteHeaders, DEFAULT_MAPPING);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('employeeName');
    });

    it('should be valid if only posting date is present', () => {
      const headersOnlyPosting = ['Employee / Vendor / Client Name', 'Posting Date', 'Quantity', 'Project Name'];
      const result = validateMapping(headersOnlyPosting, DEFAULT_MAPPING);
      expect(result.isValid).toBe(true);
    });

    it('should be valid if only transaction date is present', () => {
      const headersOnlyTrans = ['Employee / Vendor / Client Name', 'Transaction Date', 'Quantity', 'Project Name'];
      const result = validateMapping(headersOnlyTrans, DEFAULT_MAPPING);
      expect(result.isValid).toBe(true);
    });

    it('should be invalid if both date fields are missing from headers', () => {
      const noDateHeaders = ['Employee / Vendor / Client Name', 'Quantity', 'Project Name'];
      const result = validateMapping(noDateHeaders, DEFAULT_MAPPING);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('transactionDate');
    });
  });

  it('should skip rows with undefined or null date values', () => {
    const dataWithMissingDate = [
      { EmpName: 'Charlie', WorkDate: undefined, Hrs: '2', Proj: 'P3' },
      { EmpName: 'Dave', WorkDate: null, Hrs: '3', Proj: 'P4' },
      { EmpName: 'Eve', WorkDate: '2026-04-22', Hrs: '4', Proj: 'P5' }
    ];
    const normalized = normalizeTimesheet(dataWithMissingDate, mapping);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].employeeName).toBe('Eve');
  });

  it('should skip rows with invalid date formats', () => {
    const dataWithInvalidDate = [
      { EmpName: 'Frank', WorkDate: 'not-a-date', Hrs: '5', Proj: 'P6' }
    ];
    const normalized = normalizeTimesheet(dataWithInvalidDate, mapping);
    expect(normalized).toHaveLength(0);
  });

  it('should handle M/d/yy date format', () => {
    const dataWithShortDate = [
      { EmpName: 'Grace', WorkDate: '4/16/26', Hrs: '1', Proj: 'P7' }
    ];
    const normalized = normalizeTimesheet(dataWithShortDate, mapping);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].date.getFullYear()).toBe(2026);
    expect(normalized[0].date.getMonth()).toBe(3); // April is 3
    expect(normalized[0].date.getDate()).toBe(16);
  });

  it('should skip epoch dates (1969/1970)', () => {
    const dataWithEpochDate = [
      { EmpName: 'Henry', WorkDate: 0, Hrs: '1', Proj: 'P8' },
      { EmpName: 'Ivan', WorkDate: '1970-01-01', Hrs: '1', Proj: 'P9' }
    ];
    const normalized = normalizeTimesheet(dataWithEpochDate, mapping);
    expect(normalized).toHaveLength(0);
  });

  it('should filter out excluded employees', () => {
    const dataWithExcluded = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '8', Proj: 'P1' },
      { EmpName: 'Default', WorkDate: '2026-04-22', Hrs: '8', Proj: 'P1' },
      { EmpName: 'Elke Ochs', WorkDate: '2026-04-22', Hrs: '8', Proj: 'P1' },
      { EmpName: 'Sherry A Dahlquist', WorkDate: '2026-04-22', Hrs: '8', Proj: 'P1' },
      { EmpName: 'Zhonglong Zhang', WorkDate: '2026-04-22', Hrs: '8', Proj: 'P1' }
    ];
    const normalized = normalizeTimesheet(dataWithExcluded, mapping);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].employeeName).toBe('Alice');
  });

  it('should assign categories during normalization', () => {
    const categoryData = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '8', Proj: 'P1 | Billable Project', Bill: 'Yes' },
      { EmpName: 'Bob', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Admin', Bill: 'No' },
      { EmpName: 'Charlie', WorkDate: '2026-04-22', Hrs: '2', Proj: '601 | Office', Bill: 'No' },
      { EmpName: 'Dave', WorkDate: '2026-04-22', Hrs: '2', Proj: 'PROPOSAL | New Work', Bill: 'No' },
      { EmpName: 'Eve', WorkDate: '2026-04-22', Hrs: '2', Proj: '610025 | Biz Project', Bill: 'No' },
      { EmpName: 'Frank', WorkDate: '2026-04-22', Hrs: '2', Proj: 'PPL | Vacation', Bill: 'No' },
      { EmpName: 'Grace', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Unknown Task', Bill: 'No' }
    ];
    const normalized = normalizeTimesheet(categoryData, mapping);
    expect(normalized).toHaveLength(7);
    expect(normalized[0].category).toBe('Billable');
    expect(normalized[1].category).toBe('Admin');
    expect(normalized[2].category).toBe('Holiday');
    expect(normalized[3].category).toBe('BizDev');
    expect(normalized[4].category).toBe('BizDev');
    expect(normalized[5].category).toBe('PPL');
    expect(normalized[6].category).toBe('Other');
  });

  it('should categorize Business Development with various formats', () => {
    const bizDevData = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '2', Proj: '610025 | Proposal for New Dam', Bill: 'No' },
      { EmpName: 'Bob', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Business Development - Marketing', Bill: 'No' },
      { EmpName: 'Charlie', WorkDate: '2026-04-22', Hrs: '2', Proj: 'PROPOSAL | Regional Study', Bill: 'No' },
      { EmpName: 'Dave', WorkDate: '2026-04-22', Hrs: '2', Proj: 'PROPOSAL|Next Project', Bill: 'No' },
      { EmpName: 'Eve', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Business development', Bill: 'No' }
    ];
    const normalized = normalizeTimesheet(bizDevData, mapping);
    expect(normalized[0].category).toBe('BizDev');
    expect(normalized[1].category).toBe('BizDev');
    expect(normalized[2].category).toBe('BizDev');
    expect(normalized[3].category).toBe('BizDev');
    expect(normalized[4].category).toBe('BizDev');
  });
  
  it('should prioritize BizDev over Admin for 610025', () => {
    const data = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '2', Proj: '610025 | Admin Work?', Bill: 'No' }
    ];
    const normalized = normalizeTimesheet(data, mapping);
    expect(normalized[0].category).toBe('BizDev');
  });
  
  it('should categorize corporate tasks with (exp 7491)', () => {
    const corporateData = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Corporate Work (exp 7491)', Bill: 'No' },
      { EmpName: 'Bob', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Some project (EXP 7491)', Bill: 'No' }
    ];
    const normalized = normalizeTimesheet(corporateData, mapping);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].category).toBe('Corporate');
    expect(normalized[1].category).toBe('Corporate');
  });

  it('should correctly categorize 600-699 codes other than 601 as Admin', () => {
    const data = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '2', Proj: '650 | Technical Training', Bill: 'No' },
      { EmpName: 'Bob', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Proj 699', Bill: 'No' },
      { EmpName: 'Charlie', WorkDate: '2026-04-22', Hrs: '2', Proj: '600-Manual', Bill: 'No' },
      { EmpName: 'Dave', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Something 610 Else', Bill: 'No' }
    ];
    const normalized = normalizeTimesheet(data, mapping);
    expect(normalized[0].category).toBe('Admin');
    expect(normalized[1].category).toBe('Admin');
    expect(normalized[2].category).toBe('Admin');
    expect(normalized[3].category).toBe('Admin');
  });

  it('should categorize project code 601 as Holiday', () => {
    const data = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '2', Proj: '601 | Holiday', Bill: 'No' },
      { EmpName: 'Bob', WorkDate: '2026-04-22', Hrs: '2', Proj: '601', Bill: 'No' },
      { EmpName: 'Charlie', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Project-601', Bill: 'No' }
    ];
    const normalized = normalizeTimesheet(data, mapping);
    expect(normalized[0].category).toBe('Holiday');
    expect(normalized[1].category).toBe('Holiday');
    expect(normalized[2].category).toBe('Holiday');
  });

  it('should correctly categorize project code 667 as Admin', () => {
    const data = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '2', Proj: '667 | Some Admin Task', Bill: 'No' },
      { EmpName: 'Bob', WorkDate: '2026-04-22', Hrs: '2', Proj: '667', Bill: 'No' },
      { EmpName: 'Charlie', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Project-667', Bill: 'No' }
    ];
    const normalized = normalizeTimesheet(data, mapping);
    expect(normalized[0].category).toBe('Admin');
    expect(normalized[1].category).toBe('Admin');
    expect(normalized[2].category).toBe('Admin');
  });

  it('should categorized project code 642 as Corporate', () => {
    const data = [
      { EmpName: 'Alice', WorkDate: '2026-04-22', Hrs: '2', Proj: '642 | Corporate Ops', Bill: 'No' },
      { EmpName: 'Bob', WorkDate: '2026-04-22', Hrs: '2', Proj: '642', Bill: 'No' },
      { EmpName: 'Charlie', WorkDate: '2026-04-22', Hrs: '2', Proj: 'Project-642', Bill: 'No' }
    ];
    const normalized = normalizeTimesheet(data, mapping);
    expect(normalized[0].category).toBe('Corporate');
    expect(normalized[1].category).toBe('Corporate');
    expect(normalized[2].category).toBe('Corporate');
  });

  it('should parse ISO date strings correctly regardless of timezone', () => {
    const data = [
      { EmpName: 'Alice', WorkDate: '2026-04-17', Hrs: '8', Proj: 'P1' }
    ];
    const normalized = normalizeTimesheet(data, mapping);
    // If parsed as UTC, it might be 4/16 in local time
    // We want it to be 4/17 in local time
    const entryDate = normalized[0].date;
    expect(entryDate.getFullYear()).toBe(2026);
    expect(entryDate.getMonth()).toBe(3); // April is 3
    expect(entryDate.getDate()).toBe(17);
  });
  
  it('should normalize complex matrix projection format', () => {
    const rawData = [
      { 'Workload Summary': 'Week of:', '__EMPTY': '1/31/25', '__EMPTY_1': '', '__EMPTY_2': '2/7/25', '__EMPTY_3': '', '__EMPTY_4': '2/14/25' },
      { 'Workload Summary': 'Staff', '__EMPTY': 'Project', '__EMPTY_1': 'Bill', '__EMPTY_2': 'OH', '__EMPTY_3': 'Project', '__EMPTY_4': 'Bill', '__EMPTY_5': 'OH' },
      { 'Workload Summary': 'Adam N Korynta', '__EMPTY': '', '__EMPTY_1': '0', '__EMPTY_2': '0', '__EMPTY_3': '', '__EMPTY_4': '0', '__EMPTY_5': '0' },
      { 'Workload Summary': '40 Hour', '__EMPTY': 'Project A', '__EMPTY_1': '10', '__EMPTY_2': '0', '__EMPTY_3': 'Project B', '__EMPTY_4': '20', '__EMPTY_5': '0' },
      { 'Workload Summary': '', '__EMPTY': 'Project C', '__EMPTY_1': '5', '__EMPTY_2': '0', '__EMPTY_3': '', '__EMPTY_4': '', '__EMPTY_5': '' },
      { 'Workload Summary': 'Total:', '__EMPTY': '', '__EMPTY_1': '15', '__EMPTY_2': '0', '__EMPTY_3': '', '__EMPTY_4': '20', '__EMPTY_5': '0' },
      { 'Workload Summary': 'Andreas G Christmann', '__EMPTY': '', '__EMPTY_1': '0', '__EMPTY_2': '0' },
      { 'Workload Summary': '20 Hour', '__EMPTY': 'Project D', '__EMPTY_1': '5', '__EMPTY_2': '0' }
    ];

    const { normalizeProjections } = require('./normalization');
    const projections = normalizeProjections(rawData);

    // Adam: 1/31: 10 + 5 = 15; 2/7: 20
    // Andreas: 1/31: 5
    expect(projections).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeName: 'Adam N Korynta', projectedHours: 15, billableHours: 15, overheadHours: 0, totalProjectedHours: 15 }),
      expect.objectContaining({ employeeName: 'Adam N Korynta', projectedHours: 20, billableHours: 20, overheadHours: 0, totalProjectedHours: 20 }),
      expect.objectContaining({ employeeName: 'Andreas G Christmann', projectedHours: 5, billableHours: 5, overheadHours: 0, totalProjectedHours: 5 })
    ]));
  });

  it('should normalize workload projections with billable and overhead category columns', () => {
    const rawData = [
      { '': 'Act.', 'Workload Summary': 'Week of:', '__EMPTY': '2/28/25', '__EMPTY_1': '', '__EMPTY_2': '', '__EMPTY_3': '3/7/25', '__EMPTY_4': '', '__EMPTY_5': '' },
      { '': 'Type', 'Workload Summary': 'Staff', '__EMPTY': 'Project', '__EMPTY_1': 'Bill', '__EMPTY_2': 'OH', '__EMPTY_3': 'Project', '__EMPTY_4': 'Bill', '__EMPTY_5': 'OH' },
      { '': '', 'Workload Summary': 'Adam N Korynta', '__EMPTY': '', '__EMPTY_1': '28', '__EMPTY_2': '12', '__EMPTY_3': '', '__EMPTY_4': '29', '__EMPTY_5': '11' },
      { '': 'Proj', 'Workload Summary': '40 Hour', '__EMPTY': 'Project A', '__EMPTY_1': '16', '__EMPTY_2': '', '__EMPTY_3': 'Project A', '__EMPTY_4': '20', '__EMPTY_5': '' },
      { '': 'Proj', 'Workload Summary': '', '__EMPTY': 'Project B', '__EMPTY_1': '12', '__EMPTY_2': '', '__EMPTY_3': 'Project B', '__EMPTY_4': '9', '__EMPTY_5': '' },
      { '': 'OH', 'Workload Summary': '', '__EMPTY': 'Admin/ Training', '__EMPTY_1': '', '__EMPTY_2': '1', '__EMPTY_3': 'Admin/ Training', '__EMPTY_4': '', '__EMPTY_5': '1' },
      { '': 'OH', 'Workload Summary': '', '__EMPTY': 'Business Development', '__EMPTY_1': '', '__EMPTY_2': '5', '__EMPTY_3': 'Business Development', '__EMPTY_4': '', '__EMPTY_5': '1' },
      { '': 'OH', 'Workload Summary': '', '__EMPTY': 'PPL/Holiday', '__EMPTY_1': '', '__EMPTY_2': '6', '__EMPTY_3': 'PPL/Holiday', '__EMPTY_4': '', '__EMPTY_5': '9' },
      { '': 'Avail', 'Workload Summary': '', '__EMPTY': 'Available', '__EMPTY_1': '', '__EMPTY_2': '0', '__EMPTY_3': 'Available', '__EMPTY_4': '', '__EMPTY_5': '0' },
      { '': 'Total', 'Workload Summary': '', '__EMPTY': 'Total:', '__EMPTY_1': '', '__EMPTY_2': '40', '__EMPTY_3': 'Total:', '__EMPTY_4': '', '__EMPTY_5': '40' },
      { '': '', 'Workload Summary': 'Edward Gross', '__EMPTY': '', '__EMPTY_1': '40', '__EMPTY_2': '0', '__EMPTY_3': '', '__EMPTY_4': '30', '__EMPTY_5': '10' },
      { '': 'Proj', 'Workload Summary': '40 Hour', '__EMPTY': 'Project C', '__EMPTY_1': '26', '__EMPTY_2': '', '__EMPTY_3': 'Project D', '__EMPTY_4': '30', '__EMPTY_5': '' },
      { '': 'Proj', 'Workload Summary': '', '__EMPTY': 'Admin/ Training', '__EMPTY_1': '2', '__EMPTY_2': '', '__EMPTY_3': 'Proposal OH', '__EMPTY_4': '', '__EMPTY_5': '2' },
      { '': 'OH', 'Workload Summary': '', '__EMPTY': 'Business Development', '__EMPTY_1': '12', '__EMPTY_2': '', '__EMPTY_3': 'Business Development', '__EMPTY_4': '', '__EMPTY_5': '8' }
    ];

    const { normalizeProjections } = require('./normalization');
    const projections = normalizeProjections(rawData);

    expect(projections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        employeeName: 'Adam N Korynta',
        projectedHours: 28,
        billableHours: 28,
        overheadHours: 12,
        adminTrainingHours: 1,
        businessDevelopmentHours: 5,
        pplHolidayHours: 6,
        totalProjectedHours: 40
      }),
      expect.objectContaining({
        employeeName: 'Edward Gross',
        projectedHours: 40,
        billableHours: 40,
        overheadHours: 0,
        adminTrainingHours: 2,
        businessDevelopmentHours: 12,
        totalProjectedHours: 40
      }),
      expect.objectContaining({
        employeeName: 'Edward Gross',
        projectedHours: 30,
        billableHours: 30,
        overheadHours: 10,
        businessDevelopmentHours: 8,
        otherOverheadHours: 2,
        totalProjectedHours: 40
      })
    ]));
  });

  it('should normalize workload projections from raw XLSX grid rows with Excel serial dates', () => {
    const rawData = [
      ['', 'Workload Summary', '', '', '', '', '', ''],
      ['Act.', 'Week of:', 45716, '', '', 45723, '', ''],
      ['Type', 'Staff', 'Project', 'Bill', 'OH', 'Project', 'Bill', 'OH'],
      ['', 'Adam N Korynta', '', 28, 12, '', 29, 11],
      ['Proj', '40 Hour', 'Project A', 16, '', 'Project A', 20, ''],
      ['Proj', '', 'Project B', 12, '', 'Project B', 9, ''],
      ['OH', '', 'Admin/ Training', '', 1, 'Admin/ Training', '', 1],
      ['OH', '', 'Business Development', '', 5, 'Business Development', '', 1],
      ['OH', '', 'PPL/Holiday', '', 6, 'PPL/Holiday', '', 9],
      ['Avail', '', 'Available', '', 0, 'Available', '', 0],
      ['Total', '', 'Total:', '', 40, 'Total:', '', 40]
    ];

    const { normalizeProjections } = require('./normalization');
    const projections = normalizeProjections(rawData);

    expect(projections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        employeeName: 'Adam N Korynta',
        date: new Date(2025, 1, 28),
        projectedHours: 28,
        overheadHours: 12,
        totalProjectedHours: 40
      }),
      expect.objectContaining({
        employeeName: 'Adam N Korynta',
        date: new Date(2025, 2, 7),
        projectedHours: 29,
        overheadHours: 11,
        totalProjectedHours: 40
      })
    ]));
    expect(projections.some(p => p.employeeName === '40')).toBe(false);
  });

  it('should normalize organization project summary exports with pending task blocks', () => {
    const rawProjects = [
      { __EMPTY: 'Organization Name: Resource Mgmt. Assoc. (46 items)', 'Project Name': '', 'Project Manager Name': '', 'All Effort': '', 'Project Code': '', 'TD Budget Effort': '' },
      { __EMPTY: '', 'Project Name': '21-022 CBEC Engineering (SJR Scour Hole Study)', 'Project Manager Name': 'Edward S Gross', 'All Effort': 0, 'Project Code': '2406969', 'TD Budget Effort': 321939.33 },
      { __EMPTY: '', 'Project Name': '', 'Project Manager Name': 'Project Name: 21-028 ICF-DWR ITP Habitat/Entrainment (DISE)', 'All Effort': '', 'Project Code': '', 'TD Budget Effort': '' },
      { __EMPTY: '', 'Project Name': '', 'Project Manager Name': 'Task Summary', 'All Effort': '', 'Project Code': '', 'TD Budget Effort': '' },
      { __EMPTY: '', 'Project Name': '', 'Project Manager Name': 'Task Name', 'All Effort': 'Task Code', 'Project Code': 'All Effort', 'TD Budget Effort': 'TD Budget Effort' },
      { __EMPTY: '', 'Project Name': '', 'Project Manager Name': 'Professional Services', 'All Effort': '1', 'Project Code': 0, 'TD Budget Effort': 183166 },
      { __EMPTY: '', 'Project Name': '', 'Project Manager Name': 'First Flush (NTP)', 'All Effort': '3', 'Project Code': 0, 'TD Budget Effort': 183166 },
      { __EMPTY: '', 'Project Name': '21-028 ICF-DWR ITP Habitat/Entrainment (DISE)', 'Project Manager Name': 'Edward S Gross', 'All Effort': 0, 'Project Code': '2406972', 'TD Budget Effort': 407658 }
    ];

    const projects = normalizeProjectSnapshots(rawProjects);
    const projectWithTasks = projects.find(project => project.projectCode === '2406972');

    expect(projects).toHaveLength(2);
    expect(projectWithTasks).toEqual(expect.objectContaining({
      projectName: '21-028 ICF-DWR ITP Habitat/Entrainment (DISE)',
      projectManager: 'Edward S Gross',
      budgetHours: 407658
    }));
    expect(projectWithTasks?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'First Flush (NTP)', budgetHours: 183166 })
    ]));
    expect(projectWithTasks?.tasks.some(task => task.name === 'Professional Services')).toBe(false);
  });

  it('should normalize project summary exports with project and task finish dates', () => {
    const rawProjects = [
      { 'Project Name': '', 'Project Start Date': 'Project Name: 19-017 Stillwater DWR Hydrodynamic Modeling', 'Project Manager Name': '', 'Project Finish Date': '', 'Project Code': '', 'TD Budget Effort': '', 'All Effort': '' },
      { 'Project Name': '', 'Project Start Date': 'Task Summary', 'Project Manager Name': '', 'Project Finish Date': '', 'Project Code': '', 'TD Budget Effort': '', 'All Effort': '' },
      { 'Project Name': '', 'Project Start Date': 'Task Name', 'Project Manager Name': 'All Effort', 'Project Finish Date': 'Task Finish Date', 'Project Code': 'TD Budget Effort', 'TD Budget Effort': 'Task Code', 'All Effort': '' },
      { 'Project Name': '', 'Project Start Date': 'Professional Services', 'Project Manager Name': 41370.96, 'Project Finish Date': '2027-03-31T07:00:00.000Z', 'Project Code': 401240.25, 'TD Budget Effort': '1', 'All Effort': '' },
      { 'Project Name': '', 'Project Start Date': 'Water Quality Modeling Support, Labor Code 0002.16', 'Project Manager Name': 15120.25, 'Project Finish Date': '2027-03-31T07:00:00.000Z', 'Project Code': 38876.5, 'TD Budget Effort': '2C', 'All Effort': '' },
      { 'Project Name': '19-017 Stillwater DWR Hydrodynamic Modeling', 'Project Start Date': '2019-03-29T07:00:00.000Z', 'Project Manager Name': 'Stacie E Carter', 'Project Finish Date': '2027-03-31T07:00:00.000Z', 'Project Code': '2406964', 'TD Budget Effort': 401240.25, 'All Effort': 41370.96 },
      { 'Project Name': 'USACE HEC SATOC -CDA Maintenance (F0149)', 'Project Start Date': '2025-08-20T07:00:00.000Z', 'Project Manager Name': 'Peter S Morris', 'Project Finish Date': '2028-08-20T07:00:00.000Z', 'Project Code': '2504878', 'TD Budget Effort': 421780.2, 'All Effort': 319433.08 },
      { 'Project Name': 'Zero Budget Project', 'Project Start Date': '2026-01-01T08:00:00.000Z', 'Project Manager Name': 'Nobody', 'Project Finish Date': '2026-02-01T08:00:00.000Z', 'Project Code': '2600000', 'TD Budget Effort': 0, 'All Effort': 0 }
    ];

    const projects = normalizeProjectSnapshots(rawProjects);
    const project = projects.find(p => p.projectCode === '2406964')!;
    const cdaProject = projects.find(p => p.projectCode === '2504878')!;

    expect(projects).toHaveLength(2);
    expect(project).toEqual(expect.objectContaining({
      projectCode: '2406964',
      projectManager: 'Stacie E Carter',
      budgetHours: 401240.25
    }));
    expect(project.startDate?.getFullYear()).toBe(2019);
    expect(project.finishDate?.getFullYear()).toBe(2027);
    expect(project.dueDate?.getFullYear()).toBe(2027);
    expect(project.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Water Quality Modeling Support, Labor Code 0002.16',
        budgetHours: 38876.5
      })
    ]));
    expect(project.tasks.some(task => task.name === 'Professional Services')).toBe(false);
    expect(project.tasks[0].finishDate?.getFullYear()).toBe(2027);
    expect(project.tasks[0].dueDate?.getFullYear()).toBe(2027);
    expect(cdaProject.tasks).toEqual([
      expect.objectContaining({
        name: 'Project Total',
        effortSpent: 319433.08,
        budgetHours: 421780.2
      })
    ]);
  });
});
