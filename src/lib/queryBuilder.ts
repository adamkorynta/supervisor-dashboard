/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import { QueryParams, Filter, Metrics, TimesheetEntry } from '../types';

export class QueryBuilder {
  private params: QueryParams;

  constructor() {
    this.params = {
      metrics: [],
      filters: [],
    };
  }

  groupBy(field: keyof TimesheetEntry): QueryBuilder {
    this.params.groupBy = field;
    return this;
  }

  addMetric(metric: keyof Metrics): QueryBuilder {
    if (!this.params.metrics.includes(metric)) {
      this.params.metrics.push(metric);
    }
    return this;
  }

  where(field: keyof TimesheetEntry, operator: Filter['operator'], value: any): QueryBuilder {
    this.params.filters = this.params.filters || [];
    this.params.filters.push({ field, operator, value });
    return this;
  }

  timeRange(start: Date, end: Date): QueryBuilder {
    this.params.timeRange = { start, end };
    return this;
  }

  sortBy(field: string, order: 'asc' | 'desc' = 'asc'): QueryBuilder {
    this.params.sort = { field, order };
    return this;
  }

  limit(count: number): QueryBuilder {
    this.params.limit = count;
    return this;
  }

  build(): QueryParams {
    return { ...this.params };
  }
}

export const createQuery = () => new QueryBuilder();
