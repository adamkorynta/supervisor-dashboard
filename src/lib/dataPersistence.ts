/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { NormalizedData, ProjectionEntry, ProjectionVersion, TimesheetEntry } from '@/types';

type StoredMetadata = Pick<
  NormalizedData,
  'supervisors' |
  'projects' |
  'unmatchedEmployees' |
  'rawTimesheetHeaders' |
  'rawSupervisorHeaders' |
  'rawProjectionHeaders' |
  'rawProjectHeaders'
>;

export type SaveDataOptions = {
  projectionsUploaded?: boolean;
  projectionUploadedAt?: Date;
};

const DEFAULT_DATABASE_URL = 'postgres://supervisor:supervisor@localhost:5435/supervisor_dashboard';

let pool: Pool | null = null;

export function getDatabasePool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
    });
  }
  return pool;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(toDateOnly(value));
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function hash(value: unknown) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function toDateOnly(value: Date | string | undefined | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function compactString(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getTimesheetFingerprint(entry: TimesheetEntry) {
  return hash({
    employeeId: compactString(entry.employeeId),
    employeeName: compactString(entry.employeeName),
    date: toDateOnly(entry.date),
    postingDate: toDateOnly(entry.postingDate),
    transactionDate: toDateOnly(entry.transactionDate),
    hours: Number(entry.hours || 0),
    project: compactString(entry.project),
    projectCode: compactString(entry.projectCode),
    projectName: compactString(entry.projectName),
    taskName: compactString(entry.taskName),
    taskCode: compactString(entry.taskCode),
    category: entry.category,
    billable: Boolean(entry.billable),
    cost: entry.cost ?? null,
    branch: compactString(entry.branch),
    workingOrg: compactString(entry.workingOrg),
  });
}

export function getProjectionFingerprint(entry: ProjectionEntry) {
  return hash({
    employeeId: compactString(entry.employeeId),
    employeeName: compactString(entry.employeeName),
    date: toDateOnly(entry.date),
    billableHours: entry.billableHours ?? null,
    overheadHours: entry.overheadHours ?? null,
    adminTrainingHours: entry.adminTrainingHours ?? null,
    businessDevelopmentHours: entry.businessDevelopmentHours ?? null,
    pplHolidayHours: entry.pplHolidayHours ?? null,
    otherOverheadHours: entry.otherOverheadHours ?? null,
    totalProjectedHours: entry.totalProjectedHours ?? null,
    projectedHours: entry.projectedHours ?? 0,
  });
}

export function getForecastHorizonWeeks(projectionDate: Date | string, uploadedAt: Date | string) {
  const projection = new Date(projectionDate);
  const upload = new Date(uploadedAt);
  if (Number.isNaN(projection.getTime()) || Number.isNaN(upload.getTime())) return null;

  const projectionFriday = getFridayPostingDate(projection);
  const uploadFriday = getFridayPostingDate(upload);
  const diffWeeks = Math.round((projectionFriday.getTime() - uploadFriday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const horizon = diffWeeks + 1;
  return horizon >= 1 && horizon <= 4 ? horizon : null;
}

function getFridayPostingDate(date: Date) {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localDate.getDay();
  const daysToFriday = (5 - day + 7) % 7;
  localDate.setDate(localDate.getDate() + daysToFriday);
  return localDate;
}

export async function ensureSchema(client: Pick<PoolClient, 'query'>) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      supervisors jsonb NOT NULL DEFAULT '[]'::jsonb,
      projects jsonb NOT NULL DEFAULT '[]'::jsonb,
      unmatched_employees jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_timesheet_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_supervisor_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_projection_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_project_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS timesheet_entries (
      id bigserial PRIMARY KEY,
      fingerprint text NOT NULL UNIQUE,
      employee_id text,
      employee_name text NOT NULL,
      entry_date date NOT NULL,
      posting_date date,
      transaction_date date,
      hours numeric NOT NULL,
      project_code text,
      project_name text,
      task_name text,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS projection_versions (
      id bigserial PRIMARY KEY,
      uploaded_at timestamptz NOT NULL DEFAULT now(),
      label text NOT NULL,
      row_count integer NOT NULL DEFAULT 0,
      raw_projection_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS projection_entries (
      id bigserial PRIMARY KEY,
      version_id bigint NOT NULL REFERENCES projection_versions(id) ON DELETE CASCADE,
      fingerprint text NOT NULL,
      employee_id text,
      employee_name text NOT NULL,
      projection_week date NOT NULL,
      forecast_horizon_weeks integer,
      billable_hours numeric,
      overhead_hours numeric,
      total_projected_hours numeric,
      projected_hours numeric NOT NULL DEFAULT 0,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (version_id, fingerprint)
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_timesheet_entries_date ON timesheet_entries(entry_date)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_projection_entries_week ON projection_entries(projection_week)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_projection_entries_horizon ON projection_entries(forecast_horizon_weeks)');
}

export async function saveNormalizedData(data: NormalizedData, options: SaveDataOptions = {}) {
  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureSchema(client);
    await saveMetadata(client, data);
    const timesheetResult = await insertTimesheetEntries(client, data.entries);
    let projectionVersionId: string | null = null;

    if (options.projectionsUploaded) {
      const uploadedAt = options.projectionUploadedAt || new Date();
      projectionVersionId = await insertProjectionVersion(client, data.projections, data.rawProjectionHeaders, uploadedAt);
    }

    await client.query('COMMIT');
    return {
      insertedTimesheetRows: timesheetResult.inserted,
      duplicateTimesheetRows: timesheetResult.duplicates,
      projectionVersionId,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function saveMetadata(client: PoolClient, data: NormalizedData) {
  const metadata: StoredMetadata = {
    supervisors: data.supervisors || [],
    projects: data.projects || [],
    unmatchedEmployees: data.unmatchedEmployees || [],
    rawTimesheetHeaders: data.rawTimesheetHeaders || [],
    rawSupervisorHeaders: data.rawSupervisorHeaders || [],
    rawProjectionHeaders: data.rawProjectionHeaders || [],
    rawProjectHeaders: data.rawProjectHeaders || [],
  };

  await client.query(
    `
      INSERT INTO app_metadata (
        id,
        supervisors,
        projects,
        unmatched_employees,
        raw_timesheet_headers,
        raw_supervisor_headers,
        raw_projection_headers,
        raw_project_headers,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (id) DO UPDATE SET
        supervisors = EXCLUDED.supervisors,
        projects = EXCLUDED.projects,
        unmatched_employees = EXCLUDED.unmatched_employees,
        raw_timesheet_headers = EXCLUDED.raw_timesheet_headers,
        raw_supervisor_headers = EXCLUDED.raw_supervisor_headers,
        raw_projection_headers = EXCLUDED.raw_projection_headers,
        raw_project_headers = EXCLUDED.raw_project_headers,
        updated_at = now()
    `,
    [
      JSON.stringify(metadata.supervisors),
      JSON.stringify(metadata.projects),
      JSON.stringify(metadata.unmatchedEmployees),
      JSON.stringify(metadata.rawTimesheetHeaders),
      JSON.stringify(metadata.rawSupervisorHeaders),
      JSON.stringify(metadata.rawProjectionHeaders),
      JSON.stringify(metadata.rawProjectHeaders),
    ]
  );
}

async function insertTimesheetEntries(client: PoolClient, entries: TimesheetEntry[]) {
  let inserted = 0;

  for (const entry of entries) {
    const result = await client.query(
      `
        INSERT INTO timesheet_entries (
          fingerprint,
          employee_id,
          employee_name,
          entry_date,
          posting_date,
          transaction_date,
          hours,
          project_code,
          project_name,
          task_name,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (fingerprint) DO NOTHING
      `,
      [
        getTimesheetFingerprint(entry),
        entry.employeeId || null,
        entry.employeeName,
        toDateOnly(entry.date),
        toDateOnly(entry.postingDate),
        toDateOnly(entry.transactionDate),
        entry.hours,
        entry.projectCode || null,
        entry.projectName || null,
        entry.taskName || null,
        JSON.stringify(entry),
      ]
    );
    inserted += result.rowCount || 0;
  }

  return {
    inserted,
    duplicates: entries.length - inserted,
  };
}

async function insertProjectionVersion(
  client: PoolClient,
  projections: ProjectionEntry[],
  rawProjectionHeaders: string[],
  uploadedAt: Date
) {
  const version = await client.query<{ id: string }>(
    `
      INSERT INTO projection_versions (uploaded_at, label, row_count, raw_projection_headers)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [
      uploadedAt.toISOString(),
      `Projection upload ${uploadedAt.toISOString().slice(0, 10)}`,
      projections.length,
      JSON.stringify(rawProjectionHeaders || []),
    ]
  );
  const versionId = version.rows[0].id;

  for (const projection of projections) {
    const horizon = getForecastHorizonWeeks(projection.date, uploadedAt);
    await client.query(
      `
        INSERT INTO projection_entries (
          version_id,
          fingerprint,
          employee_id,
          employee_name,
          projection_week,
          forecast_horizon_weeks,
          billable_hours,
          overhead_hours,
          total_projected_hours,
          projected_hours,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (version_id, fingerprint) DO NOTHING
      `,
      [
        versionId,
        getProjectionFingerprint(projection),
        projection.employeeId || null,
        projection.employeeName,
        toDateOnly(projection.date),
        horizon,
        projection.billableHours ?? null,
        projection.overheadHours ?? null,
        projection.totalProjectedHours ?? null,
        projection.projectedHours || 0,
        JSON.stringify(projection),
      ]
    );
  }

  return versionId;
}

export async function loadNormalizedData(): Promise<NormalizedData | null> {
  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await ensureSchema(client);
    const metadataResult = await client.query('SELECT * FROM app_metadata WHERE id = 1');
    const metadata = metadataResult.rows[0];

    const timesheetResult = await client.query('SELECT payload FROM timesheet_entries ORDER BY entry_date, id');
    const projectionVersions = await loadProjectionVersions(client);
    const latestVersion = projectionVersions[0];

    if (!metadata && timesheetResult.rows.length === 0 && projectionVersions.length === 0) return null;

    return {
      entries: timesheetResult.rows.map(row => row.payload),
      supervisors: metadata?.supervisors || [],
      projections: latestVersion?.projections || [],
      projectionVersions,
      projects: metadata?.projects || [],
      unmatchedEmployees: metadata?.unmatched_employees || [],
      rawTimesheetHeaders: metadata?.raw_timesheet_headers || [],
      rawSupervisorHeaders: metadata?.raw_supervisor_headers || [],
      rawProjectionHeaders: latestVersion?.rawProjectionHeaders || metadata?.raw_projection_headers || [],
      rawProjectHeaders: metadata?.raw_project_headers || [],
    };
  } finally {
    client.release();
  }
}

async function loadProjectionVersions(client: PoolClient): Promise<ProjectionVersion[]> {
  const versionsResult = await client.query<{
    id: string;
    uploaded_at: Date;
    label: string;
    row_count: number;
    raw_projection_headers: string[];
  }>('SELECT id, uploaded_at, label, row_count, raw_projection_headers FROM projection_versions ORDER BY uploaded_at DESC, id DESC');

  const entryResult = await client.query<{
    version_id: string;
    forecast_horizon_weeks: number | null;
    payload: ProjectionEntry;
  }>('SELECT version_id, forecast_horizon_weeks, payload FROM projection_entries ORDER BY projection_week, id');

  const entriesByVersion = new Map<string, ProjectionEntry[]>();
  entryResult.rows.forEach(row => {
    const entries = entriesByVersion.get(String(row.version_id)) || [];
    entries.push({
      ...row.payload,
      projectionVersionId: String(row.version_id),
      projectionUploadedAt: versionsResult.rows.find(version => String(version.id) === String(row.version_id))?.uploaded_at,
      forecastHorizonWeeks: row.forecast_horizon_weeks ?? undefined,
    });
    entriesByVersion.set(String(row.version_id), entries);
  });

  return versionsResult.rows.map(row => {
    const projections = entriesByVersion.get(String(row.id)) || [];
    const horizonsAvailable = Array.from(new Set(
      projections
        .map(projection => projection.forecastHorizonWeeks)
        .filter((horizon): horizon is number => typeof horizon === 'number')
    )).sort((a, b) => a - b);

    return {
      id: String(row.id),
      uploadedAt: row.uploaded_at,
      label: row.label,
      rowCount: row.row_count,
      rawProjectionHeaders: row.raw_projection_headers || [],
      horizonsAvailable,
      projections,
    };
  });
}
