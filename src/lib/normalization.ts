/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { parse, isValid } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  TimesheetEntry, 
  SupervisorMapping, 
  EXCLUDED_EMPLOYEES,
  ADMIN_PROJECT_NAME_REGEX,
  ADMIN_PROJECT_CODE_REGEX,
  HOLIDAY_PROJECT_CODE_REGEX,
  BIZ_DEV_PROJECT_NAME_REGEX,
  BIZ_DEV_PROJECT_CODE_REGEX,
  CORPORATE_PROJECT_NAME_REGEX,
  CORPORATE_PROJECT_CODE_REGEX,
  IT_PROJECT_CODE,
  ProjectionEntry,
  ProjectSnapshot,
  ProjectTaskSchedule
} from '@/types';

export interface ColumnMapping {
  employeeId?: string;
  employeeName: string;
  transactionDate: string;
  postingDate?: string;
  hours: string;
  projectCode?: string;
  project: string;
  taskName?: string;
  taskCode?: string;
  client?: string;
  billable?: string;
  cost?: string;
  rate?: string;
  branch?: string;
  taskOrg?: string;
  workingOrg?: string;
  managerName?: string;
  description?: string;
}

export const DEFAULT_MAPPING: ColumnMapping = {
  employeeName: 'Employee / Vendor / Client Name',
  transactionDate: 'Transaction Date',
  postingDate: 'Posting Date',
  hours: 'Quantity',
  projectCode: 'Project Code',
  project: 'Project Name',
  taskName: 'Task Name',
  taskCode: 'Task Code',
  client: 'Project Client Name',
  billable: 'Billable',
  cost: 'Effort',
  rate: 'Effort Rate',
  branch: 'Project Organization Name',
  taskOrg: 'Task Organization Name',
  workingOrg: 'Working Organization Name',
  managerName: 'Project Manager Name',
  description: 'Project Description',
};

const ROLLUP_TASK_NAMES = new Set([
  'professional services',
  'engineering services'
]);

function getFridayPostingDate(date: Date): Date {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localDate.getDay();
  const daysToFriday = (5 - day + 7) % 7;
  localDate.setDate(localDate.getDate() + daysToFriday);
  return localDate;
}

export function validateMapping(headers: string[], mapping: ColumnMapping): { isValid: boolean; missingFields: string[] } {
  const requiredFields: (keyof ColumnMapping)[] = ['employeeName', 'hours', 'project'];
  const missingFields: (keyof ColumnMapping)[] = [];

  requiredFields.forEach(field => {
    const columnName = mapping[field];
    if (!columnName || !headers.includes(columnName as string)) {
      missingFields.push(field);
    }
  });

  // Must have at least one date field
  const hasPostingDate = mapping.postingDate && headers.includes(mapping.postingDate);
  const hasTransactionDate = mapping.transactionDate && headers.includes(mapping.transactionDate);

  if (!hasPostingDate && !hasTransactionDate) {
    missingFields.push('transactionDate');
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

export function normalizeTimesheet(
  rawData: any[],
  mapping: ColumnMapping
): TimesheetEntry[] {
  const entries: TimesheetEntry[] = [];

  console.log(`%c[Normalization] %cStarting normalization of ${rawData.length} rows`, 'color: #17a2b8; font-weight: bold;', 'color: inherit;');
  if (typeof window !== 'undefined') {
    (window as any).normalizationLogs = [`[${new Date().toLocaleTimeString()}] Starting normalization of ${rawData.length} rows`];
  }
  const skipReasons: Record<string, number> = {
    missingDate: 0,
    invalidYear: 0,
    excludedEmployee: 0,
    zeroHours: 0
  };

  if (rawData.length > 0) {
    console.log(`[Normalization] Sample row 0 keys:`, Object.keys(rawData[0]));
    console.log(`[Normalization] Current mapping:`, mapping);
  }

  rawData.forEach((row, index) => {
    // 1. Process Posting Date
    let postingDate: Date | null = null;
    const postingDateCol = mapping.postingDate;
    const postingDateVal = postingDateCol ? row[postingDateCol] : undefined;
    if (postingDateVal) {
      postingDate = parseValueToDate(postingDateVal);
    }

    // 2. Process Transaction Date
    let transactionDate: Date | null = null;
    const transactionDateCol = mapping.transactionDate;
    const transactionDateVal = transactionDateCol ? row[transactionDateCol] : undefined;
    if (transactionDateVal) {
      transactionDate = parseValueToDate(transactionDateVal);
    }

    // Main date for filtering: strictly use Posting Date if available
    const primaryDate = postingDate || transactionDate;

    if (!primaryDate) {
      if (skipReasons.missingDate < 5) {
        const msg = `[Row ${index}] Skipped: Missing both Posting and Transaction Date`;
        console.warn(msg, row);
        if (typeof window !== 'undefined') {
          (window as any).normalizationLogs = (window as any).normalizationLogs || [];
          (window as any).normalizationLogs.push(msg);
        }
      }
      skipReasons.missingDate++;
      return; // Skip rows without any date
    }

    if (primaryDate.getFullYear() < 1980) {
      if (skipReasons.invalidYear < 5) {
        const msg = `[Row ${index}] Skipped: Invalid year ${primaryDate.getFullYear()}`;
        console.warn(msg, row);
        if (typeof window !== 'undefined') {
          (window as any).normalizationLogs = (window as any).normalizationLogs || [];
          (window as any).normalizationLogs.push(msg);
        }
      }
      skipReasons.invalidYear++;
      return;
    }

    const employeeName = row[mapping.employeeName] || 'Unknown';
    if (EXCLUDED_EMPLOYEES.includes(employeeName)) {
      if (skipReasons.excludedEmployee < 5) {
        const msg = `[Row ${index}] Skipped: Excluded employee ${employeeName}`;
        console.log(msg);
        if (typeof window !== 'undefined') {
          (window as any).normalizationLogs = (window as any).normalizationLogs || [];
          (window as any).normalizationLogs.push(msg);
        }
      }
      skipReasons.excludedEmployee++;
      return; // Skip excluded employees
    }

    const fullProjectString = row[mapping.project] || 'General';
    let projectCode = row[mapping.projectCode || ''] || '';
    let projectName = fullProjectString;

    if (!projectCode) {
      if (fullProjectString.includes('|')) {
        const parts = fullProjectString.split('|');
        projectCode = parts[0].trim();
        projectName = parts[1]?.trim() || parts[0].trim();
      } else if (fullProjectString.includes('-')) {
        // Handle cases like "601-Project"
        const parts = fullProjectString.split('-');
        const firstPart = parts[0].trim();
        if (/^\d+$/.test(firstPart)) {
          projectCode = firstPart;
          projectName = fullProjectString.substring(fullProjectString.indexOf('-') + 1).trim();
        }
      } else {
        // Handle numeric project codes without separators, like "667"
        const trimmed = fullProjectString.trim();
        if (/^\d{3,10}$/.test(trimmed)) {
          projectCode = trimmed;
        }
      }
    }

    const hours = parseFloat(row[mapping.hours]) || 0;
    if (hours === 0) {
      if (skipReasons.zeroHours < 5) {
        const msg = `[Row ${index}] Skipped: Zero hours`;
        console.log(msg);
        if (typeof window !== 'undefined') {
          (window as any).normalizationLogs = (window as any).normalizationLogs || [];
          (window as any).normalizationLogs.push(msg);
        }
      }
      skipReasons.zeroHours++;
      return;
    }

    const entry: TimesheetEntry = {
      id: `entry-${index}`,
      employeeId: row[mapping.employeeId || ''] || '',
      employeeName,
      project: fullProjectString,
      projectCode,
      projectName,
      taskName: mapping.taskName ? row[mapping.taskName] : undefined,
      taskCode: mapping.taskCode ? String(row[mapping.taskCode] || '').trim() || undefined : undefined,
      category: 'Other',
      client: mapping.client ? row[mapping.client] : undefined,
      branch: mapping.branch ? row[mapping.branch] : undefined,
      taskOrg: mapping.taskOrg ? row[mapping.taskOrg] : undefined,
      workingOrg: mapping.workingOrg ? row[mapping.workingOrg] : undefined,
      managerName: mapping.managerName ? row[mapping.managerName] : undefined,
      description: mapping.description ? row[mapping.description] : undefined,
      date: primaryDate,
      postingDate: postingDate || undefined,
      transactionDate: transactionDate || undefined,
      hours,
      billable: true,
    };

    // Determine category
    const isPPL = /PPL/i.test(projectName) || /PPL/i.test(fullProjectString);
    const isHoliday = (projectCode && new RegExp(HOLIDAY_PROJECT_CODE_REGEX).test(projectCode)) ||
                  new RegExp(HOLIDAY_PROJECT_CODE_REGEX).test(fullProjectString);
    const isAdmin = new RegExp(ADMIN_PROJECT_NAME_REGEX, 'i').test(projectName) || 
                  new RegExp(ADMIN_PROJECT_NAME_REGEX, 'i').test(fullProjectString) ||
                  (projectCode && new RegExp(ADMIN_PROJECT_CODE_REGEX).test(projectCode)) ||
                  new RegExp(ADMIN_PROJECT_CODE_REGEX).test(fullProjectString);
    const isBizDev = new RegExp(BIZ_DEV_PROJECT_NAME_REGEX, 'i').test(projectName) || 
                   new RegExp(BIZ_DEV_PROJECT_NAME_REGEX, 'i').test(fullProjectString) ||
                   (projectCode && new RegExp(BIZ_DEV_PROJECT_CODE_REGEX).test(projectCode)) ||
                   new RegExp(BIZ_DEV_PROJECT_CODE_REGEX).test(fullProjectString);
    const isCorporate = new RegExp(CORPORATE_PROJECT_NAME_REGEX, 'i').test(projectName) ||
                      new RegExp(CORPORATE_PROJECT_NAME_REGEX, 'i').test(fullProjectString) ||
                      (projectCode && new RegExp(CORPORATE_PROJECT_CODE_REGEX).test(projectCode)) ||
                      new RegExp(CORPORATE_PROJECT_CODE_REGEX).test(fullProjectString);
    
    // Parse billable
    if (mapping.billable) {
      const b = row[mapping.billable]?.toString().toLowerCase();
      entry.billable = b === 'yes' || b === 'true' || b === '1' || b === 'y';
    }

    if (projectCode === IT_PROJECT_CODE) {
      entry.category = 'IT';
    } else if (isBizDev) {
      entry.category = 'BizDev';
    } else if (isCorporate) {
      entry.category = 'Corporate';
    } else if (isPPL) {
      entry.category = 'PPL';
    } else if (isHoliday) {
      entry.category = 'Holiday';
    } else if (isAdmin) {
      entry.category = 'Admin';
    } else if (entry.billable) {
      entry.category = 'Billable';
    } else {
      entry.category = 'Other';
    }

    // Parse cost/rate
    if (mapping.cost) entry.cost = parseFloat(row[mapping.cost]);
    if (mapping.rate) entry.rate = parseFloat(row[mapping.rate]);

    entries.push(entry);
  });

  console.log(`%c[Normalization] %cNormalization complete: ${entries.length} entries created, ${rawData.length - entries.length} skipped.`, 'color: #28a745; font-weight: bold;', 'color: inherit;');
  console.log('%c[Normalization] %cSkip reasons:', 'color: #17a2b8; font-weight: bold;', 'color: inherit;', skipReasons);
  if (typeof window !== 'undefined') {
    (window as any).normalizationLogs = (window as any).normalizationLogs || [];
    (window as any).normalizationLogs.push(`Normalization complete: ${entries.length} entries created, ${rawData.length - entries.length} skipped.`);
    (window as any).normalizationLogs.push(`Skip reasons breakdown: ${JSON.stringify(skipReasons, null, 2)}`);
  }

  return entries;
}

function parseValueToDate(dateVal: any): Date | null {
  if (!dateVal) return null;

  let parsedDate: Date | null = null;
  
  if (dateVal instanceof Date) {
    // If it's already a Date object, ensure it's treated as a local date
    // to avoid shifts when filtering.
    
    // Heuristic: If the local hours are late in the day (>= 12), 
    // it's almost certainly a UTC-midnight parse that shifted back by a negative offset.
    const localHours = dateVal.getHours();
    if (localHours >= 12) {
      // Shifted back, take the next day
      const nextDay = new Date(dateVal.getTime() + (24 - localHours) * 60 * 60 * 1000);
      parsedDate = new Date(
        nextDay.getFullYear(),
        nextDay.getMonth(),
        nextDay.getDate()
      );
    } else {
      // Not shifted or shifted forward, take the local date parts as is
      parsedDate = new Date(
        dateVal.getFullYear(),
        dateVal.getMonth(),
        dateVal.getDate()
      );
    }
  } else if (typeof dateVal === 'number') {
    // Handle Excel serial dates
    parsedDate = XLSX.SSF.parse_date_code(dateVal) ? new Date(Math.round((dateVal - 25569) * 86400 * 1000)) : null;
    if (parsedDate) {
      // Excel serial dates are often UTC-based or just numeric. 
      // We want to ensure we treat the result as local midnight.
      parsedDate = new Date(
        parsedDate.getUTCFullYear(),
        parsedDate.getUTCMonth(),
        parsedDate.getUTCDate()
      );
    }
  } else if (typeof dateVal === 'string') {
    // Trim string to handle leading/trailing spaces
    const trimmedDate = dateVal.trim();
    if (!trimmedDate) return null;

    // If it's a string, try to parse it specifically to avoid timezone shifts
    // Check for YYYY-MM-DD or MM/DD/YYYY or M/D/YY
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      parsedDate = parse(trimmedDate, 'yyyy-MM-dd', new Date());
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmedDate)) {
      parsedDate = parse(trimmedDate, 'MM/dd/yyyy', new Date());
    } else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(trimmedDate)) {
      parsedDate = parse(trimmedDate, 'M/d/yy', new Date());
    } else {
      // Fallback to native Date, but ensure it's treated as local midnight if possible
      const native = new Date(trimmedDate);
      if (isValid(native)) {
        // If the native parse results in a non-midnight time, it might be a UTC-Midnight shift
        const h = native.getHours();
        if (h >= 12) {
          const nextDay = new Date(native.getTime() + (24 - h) * 60 * 60 * 1000);
          parsedDate = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate());
        } else {
          parsedDate = new Date(native.getFullYear(), native.getMonth(), native.getDate());
        }
      }
    }
  } else {
    const native = new Date(dateVal);
    if (isValid(native)) {
      parsedDate = new Date(native.getFullYear(), native.getMonth(), native.getDate());
    }
  }

  if (parsedDate && isValid(parsedDate)) {
    return parsedDate;
  }
  return null;
}

function pickHeader(headers: string[], candidates: string[]): string {
  const normalizedHeaders = headers.map(header => ({
    header,
    normalized: header.toLowerCase().replace(/[^a-z0-9]/g, '')
  }));

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exact = normalizedHeaders.find(h => h.normalized === normalizedCandidate);
    if (exact) return exact.header;
  }

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const partial = normalizedHeaders.find(h => h.normalized.includes(normalizedCandidate) || normalizedCandidate.includes(h.normalized));
    if (partial) return partial.header;
  }

  return "";
}

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  const cleaned = String(value).replace(/[$,%\s,]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeProjectKey(projectCode: string, projectName: string): string {
  const code = projectCode.trim();
  if (code) return code.toLowerCase();
  return projectName.trim().toLowerCase();
}

export function normalizeProjectSnapshots(rawData: any[]): ProjectSnapshot[] {
  if (rawData.length === 0) return [];

  const headers = Array.from(new Set(rawData.flatMap(row => Object.keys(row || {}))));
  if (
    headers.includes('Project Name') &&
    headers.includes('Project Start Date') &&
    headers.includes('Project Finish Date') &&
    headers.includes('Project Code') &&
    headers.includes('TD Budget Effort')
  ) {
    return normalizeProjectScheduleSummary(rawData);
  }

  if (
    headers.includes('Project Name') &&
    headers.includes('All Effort') &&
    headers.includes('Project Code') &&
    headers.includes('TD Budget Effort')
  ) {
    return normalizeOrganizationProjectSummary(rawData);
  }

  const projectCodeHeader = pickHeader(headers, ['Project Code', 'Project ID', 'Project Number', 'Project No', 'Project']);
  const projectNameHeader = pickHeader(headers, ['Project Name', 'Name', 'Project Description', 'Description']);
  const managerHeader = pickHeader(headers, ['Project Manager', 'Project Manager Name', 'PM', 'Manager']);
  const clientHeader = pickHeader(headers, ['Client', 'Client Name', 'Project Client Name']);
  const statusHeader = pickHeader(headers, ['Status', 'Project Status', 'Phase']);
  const dueDateHeader = pickHeader(headers, ['Due Date', 'End Date', 'Finish Date', 'Completion Date', 'Target Date']);
  const startDateHeader = pickHeader(headers, ['Start Date', 'Project Start Date']);
  const finishDateHeader = pickHeader(headers, ['Finish Date', 'Project Finish Date', 'End Date', 'Completion Date']);
  const budgetHeader = pickHeader(headers, ['Budget Hours', 'Total Budget Hours', 'Budgeted Effort', 'Budget Effort', 'Hours Budget', 'Budget']);
  const taskHeader = pickHeader(headers, ['Task', 'Task Name', 'Task Description', 'Task Code', 'WBS', 'Phase Task']);
  const taskCodeHeader = pickHeader(headers, ['Task Code', 'WBS', 'Phase Code']);
  const taskEffortHeader = pickHeader(headers, ['Task Effort', 'All Effort', 'Effort Spent', 'Actual Effort']);
  const taskBudgetHeader = pickHeader(headers, ['Task Budget Hours', 'Task Budget', 'Task Budgeted Effort', 'Budget Hours']);
  const taskStatusHeader = pickHeader(headers, ['Task Status', 'Status']);
  const taskStartDateHeader = pickHeader(headers, ['Task Start Date', 'Start Date']);
  const taskFinishDateHeader = pickHeader(headers, ['Task Finish Date', 'Task End Date', 'Finish Date']);
  const taskDueDateHeader = pickHeader(headers, ['Task Due Date', 'Task End Date', 'Due Date']);

  const projects = new Map<string, ProjectSnapshot>();

  rawData.forEach((row, index) => {
    const rawProjectCode = projectCodeHeader ? String(row[projectCodeHeader] || '').trim() : '';
    const rawProjectName = projectNameHeader ? String(row[projectNameHeader] || '').trim() : '';
    const projectCode = rawProjectCode || (rawProjectName.match(/^\d{3,10}/)?.[0] || '');
    const projectName = rawProjectName || rawProjectCode || 'Unnamed Project';
    const key = normalizeProjectKey(projectCode, projectName);

    if (!key) return;

    const startDate = startDateHeader ? parseValueToDate(row[startDateHeader]) || undefined : undefined;
    const finishDate = finishDateHeader ? parseValueToDate(row[finishDateHeader]) || undefined : undefined;
    const dueDate = dueDateHeader ? parseValueToDate(row[dueDateHeader]) || undefined : finishDate;
    const budgetHours = budgetHeader ? parseNumber(row[budgetHeader]) || 0 : 0;

    const existing = projects.get(key);
    const project: ProjectSnapshot = existing || {
      id: `project-${key.replace(/[^a-z0-9]+/gi, '-')}`,
      projectCode,
      projectName,
      projectManager: managerHeader ? String(row[managerHeader] || '').trim() || undefined : undefined,
      client: clientHeader ? String(row[clientHeader] || '').trim() || undefined : undefined,
      status: statusHeader ? String(row[statusHeader] || '').trim() || undefined : undefined,
      startDate,
      finishDate,
      dueDate,
      budgetHours: 0,
      tasks: [],
      raw: row
    };

    project.projectManager = project.projectManager || (managerHeader ? String(row[managerHeader] || '').trim() || undefined : undefined);
    project.client = project.client || (clientHeader ? String(row[clientHeader] || '').trim() || undefined : undefined);
    project.status = project.status || (statusHeader ? String(row[statusHeader] || '').trim() || undefined : undefined);
    project.startDate = project.startDate || startDate;
    project.finishDate = project.finishDate || finishDate;
    project.dueDate = project.dueDate || dueDate;

    const taskName = taskHeader ? String(row[taskHeader] || '').trim() : '';
    const taskCode = taskCodeHeader ? String(row[taskCodeHeader] || '').trim() : '';
    const taskEffort = taskEffortHeader ? parseNumber(row[taskEffortHeader]) : undefined;
    const taskBudget = taskBudgetHeader ? parseNumber(row[taskBudgetHeader]) : undefined;

    if (taskName) {
      if (isRollupTaskName(taskName)) {
        return;
      }

      const taskId = `${project.id}-task-${taskName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || index}`;
      const existingTask = project.tasks.find(task => task.name.toLowerCase() === taskName.toLowerCase());
      if (existingTask) {
        existingTask.budgetHours = (existingTask.budgetHours || 0) + (taskBudget || 0);
        existingTask.effortSpent = (existingTask.effortSpent || 0) + (taskEffort || 0);
        existingTask.code = existingTask.code || taskCode || undefined;
        existingTask.status = existingTask.status || (taskStatusHeader ? String(row[taskStatusHeader] || '').trim() || undefined : undefined);
        existingTask.startDate = existingTask.startDate || (taskStartDateHeader ? parseValueToDate(row[taskStartDateHeader]) || undefined : undefined);
        existingTask.finishDate = existingTask.finishDate || (taskFinishDateHeader ? parseValueToDate(row[taskFinishDateHeader]) || undefined : undefined);
        existingTask.dueDate = existingTask.dueDate || (taskDueDateHeader ? parseValueToDate(row[taskDueDateHeader]) || undefined : undefined);
      } else {
        const taskFinishDate = taskFinishDateHeader ? parseValueToDate(row[taskFinishDateHeader]) || undefined : undefined;
        project.tasks.push({
          id: taskId,
          name: taskName,
          code: taskCode || undefined,
          effortSpent: taskEffort,
          budgetHours: taskBudget,
          status: taskStatusHeader ? String(row[taskStatusHeader] || '').trim() || undefined : undefined,
          startDate: taskStartDateHeader ? parseValueToDate(row[taskStartDateHeader]) || undefined : undefined,
          finishDate: taskFinishDate,
          dueDate: taskDueDateHeader ? parseValueToDate(row[taskDueDateHeader]) || undefined : taskFinishDate
        });
      }
    }

    if (taskName && taskBudget !== undefined) {
      project.budgetHours += taskBudget;
    } else if (!existing || budgetHours > project.budgetHours) {
      project.budgetHours = Math.max(project.budgetHours, budgetHours);
    }

    projects.set(key, project);
  });

  return Array.from(projects.values()).filter(project => project.budgetHours > 0).sort((a, b) => {
    const managerCompare = (a.projectManager || '').localeCompare(b.projectManager || '');
    return managerCompare || a.projectName.localeCompare(b.projectName);
  });
}

function normalizeOrganizationProjectSummary(rawData: any[]): ProjectSnapshot[] {
  const projects = new Map<string, ProjectSnapshot>();
  const pendingTasksByProjectName = new Map<string, ProjectSnapshot['tasks']>();
  const hasProjectManagerColumn = rawData.some(row => Object.prototype.hasOwnProperty.call(row, 'Project Manager Name'));
  let taskProjectName = '';
  let inTaskSummary = false;

  rawData.forEach((row, index) => {
    const projectNameCell = String(row['Project Name'] || '').trim();
    const managerCell = hasProjectManagerColumn ? String(row['Project Manager Name'] || '').trim() : undefined;
    const projectNameMarkerCell = hasProjectManagerColumn ? row['Project Manager Name'] : row['All Effort'];
    const taskBudgetCell = hasProjectManagerColumn ? row['TD Budget Effort'] : row['__EMPTY_1'];
    const allEffortCell = row['All Effort'];
    const projectCodeCell = String(row['Project Code'] || '').trim();
    const budgetCell = row['TD Budget Effort'];

    if (typeof projectNameMarkerCell === 'string' && projectNameMarkerCell.startsWith('Project Name:')) {
      taskProjectName = projectNameMarkerCell.replace('Project Name:', '').trim();
      inTaskSummary = false;
      if (!pendingTasksByProjectName.has(taskProjectName.toLowerCase())) {
        pendingTasksByProjectName.set(taskProjectName.toLowerCase(), []);
      }
      return;
    }

    if (String(projectNameMarkerCell || '').trim() === 'Task Summary') {
      inTaskSummary = true;
      return;
    }

    if (String(projectNameMarkerCell || '').trim() === 'Task Name') {
      return;
    }

    const budgetHours = parseNumber(budgetCell);
    const allEffort = parseNumber(allEffortCell);
    const isProjectRow = projectNameCell &&
      projectCodeCell &&
      budgetHours !== undefined &&
      !projectNameCell.startsWith('Organization Name:');

    if (isProjectRow) {
      const key = normalizeProjectKey(projectCodeCell, projectNameCell);
      const pendingTasks = pendingTasksByProjectName.get(projectNameCell.toLowerCase()) || [];
      const tasks = pendingTasks.length > 0 ? pendingTasks : [{
        id: `task-${key.replace(/[^a-z0-9]+/gi, '-')}-project-total`,
        name: 'Project Total',
        effortSpent: allEffort,
        budgetHours
      }];

      projects.set(key, {
        id: `project-${key.replace(/[^a-z0-9]+/gi, '-')}`,
        projectCode: projectCodeCell,
        projectName: projectNameCell,
        projectManager: managerCell || undefined,
        budgetHours,
        tasks,
        raw: {
          ...row,
          allEffort
        }
      });
      inTaskSummary = false;
      taskProjectName = '';
      return;
    }

    if (inTaskSummary && taskProjectName && typeof projectNameMarkerCell === 'string' && projectNameMarkerCell.trim()) {
      const taskBudget = parseNumber(taskBudgetCell);
      const taskEffort = parseNumber(hasProjectManagerColumn ? row['Project Code'] : row['TD Budget Effort']);
      const taskCode = String(hasProjectManagerColumn ? row['All Effort'] : row['Project Code'] || '').trim();
      const taskName = projectNameMarkerCell.trim();
      if (isRollupTaskName(taskName)) {
        return;
      }

      const tasks = pendingTasksByProjectName.get(taskProjectName.toLowerCase()) || [];
      tasks.push({
        id: `task-${taskProjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
        name: taskName,
        code: taskCode || undefined,
        effortSpent: taskEffort,
        budgetHours: taskBudget
      });
      pendingTasksByProjectName.set(taskProjectName.toLowerCase(), tasks);
      return;
    }
  });

  return Array.from(projects.values())
    .filter(project => project.budgetHours > 0)
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
}

function normalizeProjectScheduleSummary(rawData: any[]): ProjectSnapshot[] {
  const projects = new Map<string, ProjectSnapshot>();
  const pendingTasksByProjectName = new Map<string, ProjectSnapshot['tasks']>();
  const hasProjectManagerColumn = rawData.some(row => Object.prototype.hasOwnProperty.call(row, 'Project Manager Name'));
  let taskProjectName = '';
  let inTaskSummary = false;

  rawData.forEach((row, index) => {
    const projectNameCell = String(row['Project Name'] || '').trim();
    const projectMarkerCell = String(row['Project Start Date'] || '').trim();
    const projectManager = String(row['Project Manager Name'] || '').trim();
    const projectStartDate = parseValueToDate(row['Project Start Date']) || undefined;
    const projectFinishDate = parseValueToDate(row['Project Finish Date']) || undefined;
    const projectCodeCell = String(row['Project Code'] || '').trim();
    const budgetHours = parseNumber(row['TD Budget Effort']);
    const allEffort = parseNumber(row['All Effort']);

    if (projectMarkerCell.startsWith('Project Name:')) {
      taskProjectName = projectMarkerCell.replace('Project Name:', '').trim();
      inTaskSummary = false;
      if (!pendingTasksByProjectName.has(taskProjectName.toLowerCase())) {
        pendingTasksByProjectName.set(taskProjectName.toLowerCase(), []);
      }
      return;
    }

    if (projectMarkerCell === 'Task Summary') {
      inTaskSummary = true;
      return;
    }

    if (projectMarkerCell === 'Task Name') {
      return;
    }

    const isProjectRow = projectNameCell &&
      projectCodeCell &&
      budgetHours !== undefined &&
      !projectNameCell.startsWith('Organization Name:');

    if (isProjectRow) {
      const key = normalizeProjectKey(projectCodeCell, projectNameCell);
      const pendingTasks = pendingTasksByProjectName.get(projectNameCell.toLowerCase()) || [];
      const tasks = pendingTasks.length > 0 ? pendingTasks : [{
        id: `task-${key.replace(/[^a-z0-9]+/gi, '-')}-project-total`,
        name: 'Project Total',
        effortSpent: allEffort,
        budgetHours,
        finishDate: projectFinishDate,
        dueDate: projectFinishDate
      }];

      projects.set(key, {
        id: `project-${key.replace(/[^a-z0-9]+/gi, '-')}`,
        projectCode: projectCodeCell,
        projectName: projectNameCell,
        projectManager: projectManager || undefined,
        startDate: projectStartDate,
        finishDate: projectFinishDate,
        dueDate: projectFinishDate,
        budgetHours,
        tasks,
        raw: {
          ...row,
          allEffort
        }
      });
      inTaskSummary = false;
      taskProjectName = '';
      return;
    }

    if (inTaskSummary && taskProjectName && projectMarkerCell) {
      const taskBudget = parseNumber(hasProjectManagerColumn ? row['Project Code'] : row['TD Budget Effort']);
      const taskEffort = parseNumber(row['Project Manager Name']);
      const taskCode = String(row['TD Budget Effort'] || '').trim();
      const taskFinishDate = parseValueToDate(row['Project Finish Date']) || undefined;
      if (isRollupTaskName(projectMarkerCell)) {
        return;
      }

      const tasks = pendingTasksByProjectName.get(taskProjectName.toLowerCase()) || [];
      tasks.push({
        id: `task-${taskProjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
        name: projectMarkerCell,
        code: taskCode || undefined,
        effortSpent: taskEffort,
        budgetHours: taskBudget,
        finishDate: taskFinishDate,
        dueDate: taskFinishDate
      });
      pendingTasksByProjectName.set(taskProjectName.toLowerCase(), tasks);
    }
  });

  return Array.from(projects.values())
    .filter(project => project.budgetHours > 0)
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
}

function isRollupTaskName(taskName: string): boolean {
  return ROLLUP_TASK_NAMES.has(taskName.trim().toLowerCase());
}

/**
 * Normalizes project task schedules from an upload.
 * Columns: Task ID, Task Name, Dependency, Start Date, End Date, Duration (Days), Labor Hours, Cost ($), Labor Resources, Notes
 */
export function normalizeProjectSchedules(rawData: any[]): ProjectTaskSchedule[] {
  return rawData.map((row, index) => {
    // Pick headers flexibly
    const taskId = String(row[pickHeader(Object.keys(row), ['Task ID', 'ID'])] || index).trim();
    const taskName = String(row[pickHeader(Object.keys(row), ['Task Name', 'Name'])] || '').trim();
    const dependency = String(row[pickHeader(Object.keys(row), ['Dependency'])] || '').trim();
    const startDate = parseValueToDate(row[pickHeader(Object.keys(row), ['Start Date', 'Start'])]) || new Date();
    const endDate = parseValueToDate(row[pickHeader(Object.keys(row), ['End Date', 'End', 'Finish Date', 'Finish'])]) || new Date();
    const durationDays = parseNumber(row[pickHeader(Object.keys(row), ['Duration (Days)', 'Duration'])]) || 0;
    const laborHours = parseNumber(row[pickHeader(Object.keys(row), ['Labor Hours', 'Hours'])]) || 0;
    const cost = parseNumber(row[pickHeader(Object.keys(row), ['Cost ($)', 'Cost'])]) || 0;
    const laborResources = String(row[pickHeader(Object.keys(row), ['Labor Resources', 'Resources'])] || '').trim();
    const notes = String(row[pickHeader(Object.keys(row), ['Notes'])] || '').trim();
    const projectCode = String(row[pickHeader(Object.keys(row), ['Project Code', 'Project', 'Project ID', 'Project Number'])] || '').trim();
    const projectName = String(row[pickHeader(Object.keys(row), ['Project Name', 'Project Description', 'Description'])] || '').trim();

    return {
      taskId,
      taskName,
      dependency: dependency || undefined,
      startDate,
      endDate,
      durationDays,
      laborHours,
      cost,
      laborResources: laborResources || undefined,
      notes: notes || undefined,
      projectCode: projectCode || undefined,
      projectName: projectName || undefined
    };
  }).filter(s => s.taskName);
}

export function normalizeProjections(rawData: any[]): ProjectionEntry[] {
  const projections: ProjectionEntry[] = [];
  
  if (rawData.length === 0) return projections;

  const headers = Object.keys(rawData[0]);
  const isMatrixFormat = headers.some(h => String(h).includes('Week of:')) || 
                         rawData.some(row => Object.values(row).some(v => String(v).includes('Week of:')));

  if (isMatrixFormat) {
    const weekDates: { date: Date, projectIndex: number, billIndex: number, ohIndex: number }[] = [];
    const seenWeekColumns = new Set<string>();
    
    const rowValues = (row: any): unknown[] => Array.isArray(row) ? row : Object.keys(row).map(key => row[key]);
    const parseHours = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const normalized = String(value).replace(/,/g, '').trim();
      if (!normalized) return 0;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const normalizeLabel = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();
    const overheadCategoryForLabel = (label: string): 'adminTrainingHours' | 'businessDevelopmentHours' | 'pplHolidayHours' | undefined => {
      const normalized = normalizeLabel(label);
      if (normalized.includes('admin') || normalized.includes('training')) return 'adminTrainingHours';
      if (normalized.includes('business development')) return 'businessDevelopmentHours';
      if (normalized.includes('ppl') || normalized.includes('holiday')) return 'pplHolidayHours';
      return undefined;
    };

    type ProjectionAccumulator = {
      billableHours: number;
      overheadHours: number;
      adminTrainingHours: number;
      businessDevelopmentHours: number;
      pplHolidayHours: number;
      otherOverheadHours: number;
      totalProjectedHours: number;
    };
    const createAccumulator = (): ProjectionAccumulator => ({
      billableHours: 0,
      overheadHours: 0,
      adminTrainingHours: 0,
      businessDevelopmentHours: 0,
      pplHolidayHours: 0,
      otherOverheadHours: 0,
      totalProjectedHours: 0
    });

    const weekOfRowIdx = rawData.findIndex(row => Object.values(row).some(v => String(v).includes('Week of:')));
    const staffRowIdx = rawData.findIndex(row => Object.values(row).some(v => String(v) === 'Staff'));
    const staffIndex = staffRowIdx === -1 ? 0 : rowValues(rawData[staffRowIdx]).findIndex(value => String(value).trim() === 'Staff');

    if (weekOfRowIdx !== -1 && staffRowIdx !== -1) {
      const weekOfRow = rawData[weekOfRowIdx];
      const staffRow = rawData[staffRowIdx];
      const weekValues = rowValues(weekOfRow);
      const staffValues = rowValues(staffRow);
      
      weekValues.forEach((rawValue, idx) => {
        const val = String(rawValue || '').trim();
        let date = parseValueToDate(val.includes('Week of:') ? val.replace('Week of:', '').trim() : rawValue);

        if (!date && val.includes('Week of:') && idx + 1 < weekValues.length) {
          date = parseValueToDate(weekValues[idx + 1]);
        }

        if (date && (date.getFullYear() < 1980 || date.getFullYear() > 2100)) return;
        if (!date) return;

        const searchStart = Math.max(0, idx - 1);
        const searchEnd = Math.min(staffValues.length, idx + 4);
        let billIndex = -1;
        let ohIndex = -1;
        let projectIndex = -1;

        for (let i = searchStart; i < searchEnd; i++) {
          const header = String(staffValues[i] || '').trim();
          if (header === 'Project') projectIndex = i;
          if (header === 'Bill') billIndex = i;
          if (header === 'OH') ohIndex = i;
        }

        if (projectIndex === -1 && billIndex > 0) projectIndex = billIndex - 1;
        if (ohIndex === -1 && billIndex !== -1 && billIndex + 1 < staffValues.length) ohIndex = billIndex + 1;

        if (billIndex !== -1 && ohIndex !== -1) {
          const postingDate = getFridayPostingDate(date);
          const key = `${date.getTime()}:${billIndex}:${ohIndex}`;
          if (!seenWeekColumns.has(key)) {
            weekDates.push({ date: postingDate, projectIndex, billIndex, ohIndex });
            seenWeekColumns.add(key);
          }
        }
      });
    }

    let currentEmployee = '';
    const employeeHours = new Map<string, Map<number, ProjectionAccumulator>>();

    rawData.forEach((row, idx) => {
      if (idx <= Math.max(weekOfRowIdx, staffRowIdx)) return;

      const values = rowValues(row);
      const firstColVal = String(values[0] || '').trim();
      const staffColVal = staffIndex >= 0 ? String(values[staffIndex] || '').trim() : '';
      const employeeCandidate = staffColVal || firstColVal;
      const normalizedFirstCol = normalizeLabel(firstColVal);
      const isSummaryRow = ['total', 'total:', 'available'].includes(normalizedFirstCol) ||
        weekDates.some(({ projectIndex }) => normalizeLabel(String(values[projectIndex] || '')) === 'total:' || normalizeLabel(String(values[projectIndex] || '')) === 'available');
      const isEmployeeRow = employeeCandidate && 
          !/^\d+ Hour$/i.test(employeeCandidate) && 
          !['staff', 'project', 'bill', 'oh', 'proj', 'avail', 'total', 'total:', 'available', 'admin/ training', 'business development', 'ppl/holiday'].includes(normalizeLabel(employeeCandidate)) &&
          /[a-z]/i.test(employeeCandidate) &&
          !employeeCandidate.includes('Week of:');
      
      if (isEmployeeRow) {
        currentEmployee = employeeCandidate;
        return;
      }

      if (currentEmployee && weekDates.length > 0 && isSummaryRow) {
        const weekMap = employeeHours.get(currentEmployee);
        if (!weekMap) return;

        weekDates.forEach(({ date, projectIndex, billIndex, ohIndex }) => {
          const projectLabel = normalizeLabel(String(values[projectIndex] || ''));
          const isTotalRow = normalizedFirstCol === 'total' || normalizedFirstCol === 'total:' || projectLabel === 'total' || projectLabel === 'total:';
          if (!isTotalRow) return;

          const totalHours = parseHours(values[ohIndex]) || parseHours(values[billIndex]);
          if (totalHours <= 0) return;

          const time = date.getTime();
          const accumulator = weekMap.get(time);
          if (!accumulator) return;
          accumulator.totalProjectedHours = Math.max(accumulator.totalProjectedHours, totalHours);
          weekMap.set(time, accumulator);
        });
      }

      if (currentEmployee && weekDates.length > 0 && !isSummaryRow) {
        if (!employeeHours.has(currentEmployee)) {
          employeeHours.set(currentEmployee, new Map());
        }
        const weekMap = employeeHours.get(currentEmployee)!;

        weekDates.forEach(({ date, projectIndex, billIndex, ohIndex }) => {
          const billHours = parseHours(values[billIndex]);
          const ohHours = parseHours(values[ohIndex]);
          if (billHours === 0 && ohHours === 0) return;

          const projectLabel = String(values[projectIndex] || '').trim();
          const category = overheadCategoryForLabel(projectLabel);
          const time = date.getTime();
          const accumulator = weekMap.get(time) || createAccumulator();

          accumulator.billableHours += billHours;
          accumulator.overheadHours += ohHours;

          if (category) {
            accumulator[category] += billHours + ohHours;
          } else if (ohHours !== 0) {
            accumulator.otherOverheadHours += ohHours;
          }

          weekMap.set(time, accumulator);
        });
      }
    });

    employeeHours.forEach((weekMap, name) => {
      weekMap.forEach((hours, time) => {
        projections.push({
          employeeId: '',
          employeeName: name,
          date: new Date(time),
          billableHours: hours.billableHours,
          overheadHours: hours.overheadHours,
          adminTrainingHours: hours.adminTrainingHours,
          businessDevelopmentHours: hours.businessDevelopmentHours,
          pplHolidayHours: hours.pplHolidayHours,
          otherOverheadHours: hours.otherOverheadHours,
          totalProjectedHours: hours.totalProjectedHours || hours.billableHours + hours.overheadHours,
          projectedHours: hours.billableHours
        });
      });
    });

  } else {
    // Standard flat format handling
    rawData.forEach((row) => {
      const employeeId = String(row['Employee ID'] || row['ID'] || '');
      const employeeName = String(row['Employee Name'] || row['Name'] || '');
      const dateVal = row['Date'] || row['Monday'] || row['Week Start'];
      const projectedHours = parseFloat(String(row['Projected Hours'] || row['Hours'] || '0'));
      
      const date = parseValueToDate(dateVal);
      
      if (date && !isNaN(projectedHours)) {
        projections.push({
          employeeId,
          employeeName,
          date: getFridayPostingDate(date),
          projectedHours
        });
      }
    });
  }
  
  return projections;
}

export function mergeSupervisors(
  entries: TimesheetEntry[],
  supervisors: SupervisorMapping[]
): { entries: TimesheetEntry[], unmatchedEmployees: string[] } {
  const supervisorMap = new Map<string, SupervisorMapping>();
  supervisors.forEach(s => {
    if (s.employeeId) supervisorMap.set(`id:${s.employeeId}`, s);
    if (s.employeeName) supervisorMap.set(`name:${s.employeeName.toLowerCase()}`, s);
  });

  const unmatchedSet = new Set<string>();
  const mergedEntries = entries.map(entry => {
    let mapping = supervisorMap.get(`id:${entry.employeeId}`);
    if (!mapping) {
      mapping = supervisorMap.get(`name:${entry.employeeName.toLowerCase()}`);
    }

    if (mapping) {
      return {
        ...entry,
        managerName: mapping.supervisorName,
        utilizationGoal: mapping.utilizationGoal, // Include utilization goal if available
      };
    }
    
    unmatchedSet.add(entry.employeeName);
    return {
      ...entry,
      managerName: 'Shannon R Larson'
    };
  });

  return {
    entries: mergedEntries,
    unmatchedEmployees: Array.from(unmatchedSet),
  };
}
