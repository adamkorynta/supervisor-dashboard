/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { getForecastHorizonWeeks, getTimesheetFingerprint } from './dataPersistence';
import { TimesheetEntry } from '../types';

const baseEntry: TimesheetEntry = {
  id: 'entry-1',
  employeeId: 'E-100',
  employeeName: 'Ada Lovelace',
  date: new Date('2026-07-17T00:00:00'),
  postingDate: new Date('2026-07-17T00:00:00'),
  transactionDate: new Date('2026-07-14T00:00:00'),
  hours: 8,
  project: '12345 | River Model',
  projectCode: '12345',
  projectName: 'River Model',
  taskName: 'Hydrology',
  taskCode: 'H100',
  category: 'Billable',
  billable: true,
  cost: 1200,
  branch: 'Water',
  workingOrg: 'Water',
};

describe('dataPersistence duplicate and projection helpers', () => {
  it('creates the same timesheet fingerprint for duplicate rows with different transient ids', () => {
    const duplicate = {
      ...baseEntry,
      id: 'entry-999',
    };

    expect(getTimesheetFingerprint(duplicate)).toBe(getTimesheetFingerprint(baseEntry));
  });

  it('changes the timesheet fingerprint when business facts change', () => {
    const changedHours = {
      ...baseEntry,
      hours: 7.5,
    };

    expect(getTimesheetFingerprint(changedHours)).not.toBe(getTimesheetFingerprint(baseEntry));
  });

  it('classifies projection horizons from upload week through four weeks out', () => {
    const uploadedAt = new Date('2026-07-13T09:00:00');

    expect(getForecastHorizonWeeks(new Date('2026-07-17T00:00:00'), uploadedAt)).toBe(1);
    expect(getForecastHorizonWeeks(new Date('2026-07-24T00:00:00'), uploadedAt)).toBe(2);
    expect(getForecastHorizonWeeks(new Date('2026-07-31T00:00:00'), uploadedAt)).toBe(3);
    expect(getForecastHorizonWeeks(new Date('2026-08-07T00:00:00'), uploadedAt)).toBe(4);
  });

  it('returns null when a projection revision is outside the supported error-band horizon', () => {
    const uploadedAt = new Date('2026-07-13T09:00:00');

    expect(getForecastHorizonWeeks(new Date('2026-07-10T00:00:00'), uploadedAt)).toBeNull();
    expect(getForecastHorizonWeeks(new Date('2026-08-14T00:00:00'), uploadedAt)).toBeNull();
  });
});
