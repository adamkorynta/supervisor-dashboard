/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { createQuery } from './queryBuilder';

describe('QueryBuilder', () => {
  it('should build a basic query', () => {
    const query = createQuery()
      .groupBy('employeeName')
      .addMetric('totalHours')
      .build();

    expect(query.groupBy).toBe('employeeName');
    expect(query.metrics).toContain('totalHours');
  });

  it('should add filters correctly', () => {
    const query = createQuery()
      .where('project', 'eq', 'Project A')
      .build();

    expect(query.filters).toHaveLength(1);
    expect(query.filters![0]).toEqual({
      field: 'project',
      operator: 'eq',
      value: 'Project A'
    });
  });

  it('should handle complex queries', () => {
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-31');
    const query = createQuery()
      .groupBy('project')
      .addMetric('totalHours')
      .addMetric('billablePercentage')
      .where('billable', 'eq', true)
      .timeRange(start, end)
      .sortBy('totalHours', 'desc')
      .limit(5)
      .build();

    expect(query.groupBy).toBe('project');
    expect(query.metrics).toEqual(['totalHours', 'billablePercentage']);
    expect(query.timeRange).toEqual({ start, end });
    expect(query.sort).toEqual({ field: 'totalHours', order: 'desc' });
    expect(query.limit).toBe(5);
  });
});
