/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

export interface TimesheetEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  date: Date;
  hours: number;
  project: string;
  projectCode?: string;
  projectName?: string;
  taskName?: string;
  taskCode?: string;
  category: 'Billable' | 'Admin' | 'BizDev' | 'PPL' | 'Holiday' | 'Corporate' | 'IT' | 'Other';
  client?: string;
  billable: boolean;
  postingDate?: Date;
  transactionDate?: Date;
  cost?: number;
  rate?: number;
  branch?: string;
  taskOrg?: string;
  workingOrg?: string;
  managerName?: string;
  utilizationGoal?: number;
  description?: string;
}

export interface SupervisorMapping {
  employeeId: string;
  employeeName: string;
  supervisorId: string;
  supervisorName: string;
  utilizationGoal?: number;
}

export interface ProjectionEntry {
  employeeId: string;
  employeeName: string;
  date: Date; // Friday posting date for the projection week
  billableHours?: number;
  overheadHours?: number;
  adminTrainingHours?: number;
  businessDevelopmentHours?: number;
  pplHolidayHours?: number;
  otherOverheadHours?: number;
  totalProjectedHours?: number;
  projectedHours: number;
  projectionVersionId?: string;
  projectionUploadedAt?: Date | string;
  forecastHorizonWeeks?: number;
}

export interface ProjectionVersion {
  id: string;
  uploadedAt: Date | string;
  label: string;
  rowCount: number;
  rawProjectionHeaders: string[];
  horizonsAvailable: number[];
  projections: ProjectionEntry[];
}

export interface ProjectTaskSnapshot {
  id: string;
  name: string;
  code?: string;
  effortSpent?: number;
  budgetHours?: number;
  status?: string;
  startDate?: Date;
  finishDate?: Date;
  dueDate?: Date;
}

export interface ProjectSnapshot {
  id: string;
  projectCode: string;
  projectName: string;
  projectManager?: string;
  client?: string;
  status?: string;
  startDate?: Date;
  finishDate?: Date;
  dueDate?: Date;
  budgetHours: number;
  tasks: ProjectTaskSnapshot[];
  raw: Record<string, unknown>;
}

export interface ProjectTaskSchedule {
  taskId: string;
  taskName: string;
  dependency?: string;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  laborHours: number;
  cost: number;
  laborResources?: string;
  notes?: string;
  projectCode?: string; // Optional: helps in matching if multiple projects' schedules are uploaded
  projectName?: string;
}

export interface NormalizedData {
  entries: TimesheetEntry[];
  supervisors: SupervisorMapping[];
  projections: ProjectionEntry[];
  projectionVersions?: ProjectionVersion[];
  projects: ProjectSnapshot[];
  projectSchedules: ProjectTaskSchedule[];
  unmatchedEmployees: string[];
  rawTimesheetHeaders: string[];
  rawSupervisorHeaders: string[];
  rawProjectionHeaders: string[];
  rawProjectHeaders: string[];
  rawScheduleHeaders: string[];
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'coxcomb' | 'treemap' | 'sunburst' | 'stacked_pie' | 'sankey' | 'table';
  xField: string;
  yField: string;
  title?: string;
  series?: string[];
  hideLegend?: boolean;
  formatting?: {
    yAxisPrefix?: string;
    yAxisSuffix?: string;
    decimalPlaces?: number;
  };
}

export const formatHours = (hours: number | undefined | null): string => {
  if (hours === undefined || hours === null) return '0';
  return Number(hours.toFixed(2)).toString();
};

export const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '$0';
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

export function getCategoryColor(category: string): string {
  switch (category) {
    case 'Billable': return 'bg-success-subtle text-success';
    case 'Admin': return 'bg-info-subtle text-info';
    case 'BizDev': return 'bg-primary-subtle text-primary';
    case 'PPL': return 'bg-warning-subtle text-warning';
    case 'Holiday': return 'bg-warning-subtle text-warning';
    case 'Corporate': return 'bg-secondary-subtle text-secondary';
    case 'IT': return 'bg-danger-subtle text-danger';
    default: return 'bg-light text-muted';
  }
}

export type TimeBucket = 'day' | 'week' | 'month';

export interface QueryParams {
  groupBy?: keyof TimesheetEntry;
  timeBucket?: TimeBucket;
  metrics: (keyof Metrics)[];
  filters?: Filter[];
  timeRange?: { start: Date; end: Date };
  sort?: { field: string; order: 'asc' | 'desc' };
  limit?: number;
}

export interface Filter {
  field: keyof TimesheetEntry;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in' | 'regex';
  value: any;
}

export interface Metrics {
  totalHours: number;
  totalCost: number;
  averageRate: number;
  billablePercentage: number;
  bizDevPercentage: number;
  employeeCount: number;
  projectCount: number;
  entryCount: number;
  revisedUtilization: number;
  utilizationGoal?: number;
}

export const ADMIN_PROJECT_NAME_REGEX = 'Admin|PPL';
export const ADMIN_PROJECT_CODE_REGEX = '^6\\d{2}|\\b6\\d{2}\\b|^667$';
export const HOLIDAY_PROJECT_CODE_REGEX = '^601$|^601\\b|\\b601\\b';
export const BIZ_DEV_PROJECT_NAME_REGEX = '^PROPOSAL|Business Development';
export const BIZ_DEV_PROJECT_CODE_REGEX = '610025';
export const CORPORATE_PROJECT_NAME_REGEX = '\\(exp 7491\\)';
export const CORPORATE_PROJECT_CODE_REGEX = '^642$|^642\\b|\\b642\\b';
export const IT_PROJECT_CODE = '655';

// For backward compatibility (regex combined)
export const ADMIN_PPL_REGEX = `${ADMIN_PROJECT_NAME_REGEX}|${ADMIN_PROJECT_CODE_REGEX}`;
export const BIZ_DEV_REGEX = `${BIZ_DEV_PROJECT_NAME_REGEX}|${BIZ_DEV_PROJECT_CODE_REGEX}`;
export const CORPORATE_REGEX = `${CORPORATE_PROJECT_NAME_REGEX}|${CORPORATE_PROJECT_CODE_REGEX}`;

export const EXCLUDED_EMPLOYEES = [
  'Default',
  'Elke Ochs',
  'Sherry A Dahlquist',
  'Zhonglong Zhang'
];
