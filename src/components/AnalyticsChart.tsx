/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  Treemap, Sankey, Rectangle, Layer
} from 'recharts';
import { ChartSpec } from '../types';

interface ChartProps {
  spec: ChartSpec;
  data: any;
  onDataPointClick?: (entries: any[]) => void;
}

const DEFAULT_COLORS = ['#00467f', '#00a9e0', '#7bb1db', '#2e5b80', '#5bc2e7', '#a7a9ac', '#1b365d', '#007eb5', '#00335d', '#86bc25'];

export default function AnalyticsChart({ spec, data, onDataPointClick }: ChartProps) {
  const { type, xField, yField, title, formatting } = spec;

  const handlePointClick = (point: any) => {
    if (!onDataPointClick) return;
    
    // Some charts (like stacked bar) provide point.activePayload[0].payload
    // Pie charts provide the entry directly
    const payload = point.activePayload ? point.activePayload[0].payload : point.payload || point;
    const name = point.name || (point.activePayload && point.activePayload[0] ? point.activePayload[0].name : undefined);
    
    if (payload.originalEntries) {
      let entries = payload.originalEntries;
      // If we clicked a specific contributor in a multi-series chart, filter the entries
      if (name && entries.some((e: any) => e.employeeName === name)) {
        entries = entries.filter((e: any) => e.employeeName === name);
      }
      onDataPointClick(entries);
    } else if (payload.payload && payload.payload.originalEntries) {
      // Recharts sometimes nests it further
      onDataPointClick(payload.payload.originalEntries);
    } else if (point.activePayload && point.activePayload.length > 0) {
      // Check all payloads for originalEntries (for stacked bars where click might be on a segment)
      const entryPayload = point.activePayload.find((p: any) => p.payload?.originalEntries);
      if (entryPayload) {
        onDataPointClick(entryPayload.payload.originalEntries);
      }
    }
  };

  const handleTableRowClick = (row: any) => {
    if (onDataPointClick && row.originalEntries) {
      onDataPointClick(row.originalEntries);
    }
  };

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className="h-64 d-flex flex-column align-items-center justify-content-center border border-dashed rounded-3xl bg-light text-secondary">
        <div className="p-4 bg-white rounded-2xl shadow-sm mb-4">
          <ChartIcon type={type} />
        </div>
        <p className="small fw-bold tracking-tight">No data available for {title || 'chart'}</p>
      </div>
    );
  }

  const formatYValue = (value: any) => {
    if (typeof value !== 'number') return value;
    const decimalPlaces = formatting?.decimalPlaces ?? 2;
    let formatted = value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimalPlaces
    });
    if (formatting?.yAxisPrefix) formatted = formatting.yAxisPrefix + formatted;
    if (formatting?.yAxisSuffix) formatted = formatted + formatting.yAxisSuffix;
    return formatted;
  };

  const CompactLineTooltip = ({ active, label, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const normalizedPayload = payload
      .filter((item: any) => item.dataKey !== 'trendline' && item.value !== null && item.value !== undefined && Number(item.value) !== 0)
      .sort((a: any, b: any) => {
        const priority = (name: string) => name === 'total' || name === 'remaining' ? 0 : 1;
        const priorityDiff = priority(String(a.dataKey)) - priority(String(b.dataKey));
        if (priorityDiff !== 0) return priorityDiff;
        return Number(b.value || 0) - Number(a.value || 0);
      });
    const uniquePayload = Array.from(
      new Map(normalizedPayload.map((item: any) => [String(item.dataKey), item])).values()
    );

    const totalItem = uniquePayload.find((item: any) => item.dataKey === 'total' || item.dataKey === 'remaining');
    const taskItems = uniquePayload
      .filter((item: any) => item.dataKey !== 'total' && item.dataKey !== 'remaining')
      .slice(0, 4);
    const visibleItems = [totalItem, ...taskItems].filter(Boolean);

    return (
      <div className="bg-white shadow rounded-3 border-0 p-3 small" style={{ maxWidth: '320px' }}>
        <div className="fw-bold text-dark mb-2">{label}</div>
        {visibleItems.map((item: any) => (
          <div key={item.dataKey} className="d-flex align-items-center justify-content-between gap-3 mb-1">
            <div className="text-truncate" style={{ color: item.color, maxWidth: '210px' }}>
              {item.name || item.dataKey}
            </div>
            <div className="font-monospace fw-bold text-dark">{formatYValue(Number(item.value || 0))}</div>
          </div>
        ))}
        {uniquePayload.length > visibleItems.length && (
          <div className="text-muted mt-2">+{uniquePayload.length - visibleItems.length} more series</div>
        )}
      </div>
    );
  };

  const CompactRadarTooltip = ({ active, label, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const items = payload
      .filter((item: any) => item.value !== null && item.value !== undefined && Number(item.value) > 0)
      .sort((a: any, b: any) => Number(b.value || 0) - Number(a.value || 0));

    if (items.length === 0) return null;

    const visibleItems = items.slice(0, 6);

    return (
      <div className="bg-white shadow rounded-3 border-0 p-3 small" style={{ maxWidth: '300px' }}>
        <div className="fw-bold text-dark mb-2">{label}</div>
        {visibleItems.map((item: any, idx: number) => (
          <div key={`${item.dataKey}-${idx}`} className="d-flex align-items-center justify-content-between gap-3 mb-1">
            <div className="text-truncate" style={{ color: item.color, maxWidth: '180px' }}>
              {item.name || item.dataKey}
            </div>
            <div className="font-monospace fw-bold text-dark">{formatYValue(Number(item.value || 0))}</div>
          </div>
        ))}
        {items.length > visibleItems.length && (
          <div className="text-muted mt-2 border-top pt-1">+{items.length - visibleItems.length} more contributors</div>
        )}
      </div>
    );
  };

  const CompactTreemapTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    if (!data) return null;

    return (
      <div className="bg-white shadow rounded-3 border-0 p-3 small" style={{ maxWidth: '300px' }}>
        <div className="fw-bold text-dark mb-1">{data.name}</div>
        {data.taskName && <div className="text-muted mb-2">Task: {data.taskName}</div>}
        <div className="d-flex align-items-center justify-content-between gap-3">
          <div className="text-muted">Effort</div>
          <div className="font-monospace fw-bold text-primary">{formatYValue(data.value)}</div>
        </div>
      </div>
    );
  };

  const CompactSunburstTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    if (!data) return null;

    return (
      <div className="bg-white shadow rounded-3 border-0 p-3 small" style={{ maxWidth: '300px' }}>
        <div className="fw-bold text-dark mb-1">{data.name}</div>
        {data.taskName && <div className="text-muted mb-2">Task: {data.taskName}</div>}
        <div className="d-flex align-items-center justify-content-between gap-3">
          <div className="text-muted">Effort</div>
          <div className="font-monospace fw-bold text-primary">{formatYValue(data.value)}</div>
        </div>
      </div>
    );
  };

  const CompactSankeyTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    if (!data) return null;

    // If it's a link (has source/target names)
    if (data.source && data.target) {
      return (
        <div className="bg-white shadow rounded-3 border-0 p-3 small" style={{ maxWidth: '300px' }}>
          <div className="fw-bold text-dark mb-1">{data.source.name} &rarr; {data.target.name}</div>
          <div className="d-flex align-items-center justify-content-between gap-3">
            <div className="text-muted">Effort</div>
            <div className="font-monospace fw-bold text-primary">{formatYValue(data.value)}</div>
          </div>
        </div>
      );
    }

    // If it's a node
    return (
      <div className="bg-white shadow rounded-3 border-0 p-3 small" style={{ maxWidth: '300px' }}>
        <div className="fw-bold text-dark mb-1">{data.name}</div>
        <div className="d-flex align-items-center justify-content-between gap-3">
          <div className="text-muted">Total Effort</div>
          <div className="font-monospace fw-bold text-primary">{formatYValue(data.value)}</div>
        </div>
      </div>
    );
  };

  const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }: any) => {
    // containerWidth might be undefined if not passed by ResponsiveContainer or Recharts version
    // Use a fallback or better heuristic
    const isRightSide = x > 350; 
    const color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    
    // Simple SVG word wrap
    const maxTextWidth = 140;
    const fontSize = 10;
    const lineHeight = 12;
    const words = payload.name.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      // Very rough estimation: 1 char ~= 5px at 10px font size
      if ((currentLine + ' ' + words[i]).length * 5.2 < maxTextWidth) {
        currentLine += ' ' + words[i];
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);

    return (
      <Layer key={`sankey-node-${index}`}>
        <Rectangle
          x={x}
          y={y}
          width={width}
          height={height}
          fill={color}
          fillOpacity={1}
        />
        <text
          x={isRightSide ? x + width + 8 : x - 8}
          y={y + height / 2 - ((lines.length - 1) * lineHeight) / 2}
          textAnchor={isRightSide ? 'start' : 'end'}
          fontSize={`${fontSize}px`}
          fill="#444"
          fontWeight="500"
          alignmentBaseline="middle"
        >
          {lines.map((line, i) => (
            <tspan
              key={i}
              x={isRightSide ? x + width + 8 : x - 8}
              dy={i === 0 ? 0 : lineHeight}
            >
              {line}
            </tspan>
          ))}
        </text>
      </Layer>
    );
  };


  const CustomizedContent = (props: any) => {
    const { root, depth, x, y, width, height, index, name, value, colors } = props;
    if (depth !== 2) return null; // We only want to label the leaf nodes (contributors)

    const color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: color,
            stroke: '#fff',
            strokeWidth: 2 / (depth + 1e-10),
            strokeOpacity: 1 / (depth + 1e-10),
          }}
        />
        {width > 50 && height > 30 && (
          <text
            x={x + width / 2}
            y={y + height / 2 - 7}
            textAnchor="middle"
            fill="#fff"
            fontSize={11}
            fontWeight="bold"
            className="select-none pointer-events-none"
          >
            {name}
          </text>
        )}
        {width > 50 && height > 30 && (
          <text
            x={x + width / 2}
            y={y + height / 2 + 7}
            textAnchor="middle"
            fill="#fff"
            fillOpacity={0.8}
            fontSize={10}
            className="select-none pointer-events-none font-monospace"
          >
            {formatYValue(value)}
          </text>
        )}
      </g>
    );
  };

  if (type === 'table') {
    const tableData = Array.isArray(data) ? data : [];
    return (
      <div className="card border-0 shadow-sm overflow-hidden bg-white">
        {title && (
          <div className="card-header bg-white border-bottom-0 pt-4 px-4">
            <h5 className="fw-bold mb-0">{title}</h5>
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead style={{ backgroundColor: '#f8f9fa' }}>
              <tr>
                <th className="px-4 py-3 border-0 small text-muted text-uppercase fw-bold" style={{ letterSpacing: '0.05em' }}>{xField}</th>
                <th className="px-4 py-3 border-0 small text-muted text-uppercase text-end fw-bold" style={{ letterSpacing: '0.05em' }}>{yField}</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} onClick={() => handleTableRowClick(row)} style={{ cursor: onDataPointClick && row.originalEntries ? 'pointer' : 'default' }}>
                  <td className="px-4 py-3 border-bottom-light fw-bold small text-dark">{row[xField]}</td>
                  <td className="px-4 py-3 border-bottom-light text-end fw-bold small text-primary">{formatYValue(row[yField])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const chartData = Array.isArray(data) ? data : [];

  return (
    <div className="d-flex flex-column h-100 position-relative">
      {title && (
        <div className="d-flex align-items-center justify-content-between mb-4 flex-shrink-0">
          <h6 className="metric-label mb-0">{title}</h6>
          <div className="p-2 rounded-2 bg-light text-primary">
            <ChartIcon type={type} />
          </div>
        </div>
      )}
      <div className="flex-grow-1" style={{ width: '100%', minHeight: 400, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {type === 'bar' ? (
            <BarChart 
              data={chartData} 
              margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
              onClick={handlePointClick}
              style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dee2e6" />
              <XAxis 
                dataKey={xField} 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#495057', fontSize: 11, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                tickFormatter={(val) => formatYValue(val)} 
                axisLine={false} 
                tickLine={false}
                tick={{ fill: '#495057', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)', padding: '10px' }}
                cursor={{ fill: '#e9ecef' }}
                formatter={(val, name) => [formatYValue(val), name]} 
              />
              {!spec.hideLegend && (
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }} />
              )}
              {spec.series && spec.series.length > 0 ? (
                spec.series.map((seriesField, index) => (
                  <Bar 
                    key={`${seriesField}-${index}`} 
                    dataKey={seriesField} 
                    stackId="a" 
                    fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} 
                    radius={index === spec.series!.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    barSize={24} 
                  />
                ))
              ) : (
                <Bar dataKey={yField} fill="#00467f" radius={[4, 4, 0, 0]} barSize={24} />
              )}
            </BarChart>
          ) : type === 'line' ? (
            <LineChart 
              data={chartData} 
              margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
              onClick={handlePointClick}
              style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dee2e6" />
              <XAxis 
                dataKey={xField} 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#495057', fontSize: 11, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                tickFormatter={(val) => formatYValue(val)} 
                axisLine={false} 
                tickLine={false}
                tick={{ fill: '#495057', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip content={<CompactLineTooltip />} />
              {!spec.hideLegend && (
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }} />
              )}
              {spec.series && spec.series.length > 0 ? (
                spec.series.map((seriesField, index) => {
                  const isTrendline = seriesField === 'trendline';
                  const isTarget = seriesField === 'target';
                  const isProjection = seriesField === 'projection';
                  const strokeColor = isTrendline
                    ? '#6c757d'
                    : isProjection
                      ? '#d95f02'
                      : DEFAULT_COLORS[index % DEFAULT_COLORS.length];

                  return (
                    <Line
                      key={`${seriesField}-${index}`}
                      type="monotone"
                      dataKey={seriesField}
                      stroke={strokeColor}
                      strokeWidth={isTarget || isTrendline ? 2 : isProjection ? 2.75 : 2.5}
                      strokeDasharray={isTarget ? "5 5" : isTrendline ? "3 3" : isProjection ? "8 4" : "0"}
                      dot={isTarget || isTrendline ? false : { r: isProjection ? 2.5 : 3, fill: strokeColor, strokeWidth: 0 }}
                      activeDot={isTarget || isTrendline ? false : { r: 5, strokeWidth: 0, fill: strokeColor }}
                    />
                  );
                })
              ) : (
                <Line 
                  type="monotone" 
                  dataKey={yField} 
                  stroke="#00467f" 
                  strokeWidth={3} 
                  dot={{ r: 3, fill: '#00467f', strokeWidth: 0 }} 
                  activeDot={{ r: 5, strokeWidth: 0, fill: '#00467f' }}
                />
              )}
            </LineChart>
          ) : type === 'coxcomb' ? (
            <RadarChart 
              cx="50%" 
              cy="50%" 
              outerRadius="80%" 
              data={chartData}
              style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
            >
              <PolarGrid stroke="#dee2e6" />
              <PolarAngleAxis 
                dataKey={xField} 
                tick={{ fill: '#495057', fontSize: 10, fontWeight: 500 }}
              />
              <PolarRadiusAxis 
                angle={30} 
                domain={[0, 'auto']} 
                tick={{ fill: '#adb5bd', fontSize: 10 }}
                axisLine={false}
                tickFormatter={(val) => formatYValue(val)}
              />
              {spec.series && spec.series.length > 0 ? (
                spec.series.map((seriesField, index) => (
                  <Radar
                    key={`${seriesField}-${index}`}
                    name={seriesField}
                    dataKey={seriesField}
                    stroke={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                    fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                    fillOpacity={0.6}
                    onMouseDown={handlePointClick}
                  />
                ))
              ) : (
                <Radar
                  name={yField}
                  dataKey={yField}
                  stroke="#00467f"
                  fill="#00467f"
                  fillOpacity={0.6}
                  onMouseDown={handlePointClick}
                />
              )}
              <Tooltip content={<CompactRadarTooltip />} />
            </RadarChart>
          ) : type === 'treemap' ? (
            <Treemap
              data={chartData}
              dataKey={yField}
              aspectRatio={4 / 3}
              stroke="#fff"
              fill="#00467f"
              content={<CustomizedContent />}
              onClick={(node: any) => {
                // node can be the node or the event depending on version
                const payload = node.payload || node;
                if (onDataPointClick && payload.originalEntries) {
                  onDataPointClick(payload.originalEntries);
                }
              }}
              style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
            >
              <Tooltip content={<CompactTreemapTooltip />} />
            </Treemap>
          ) : type === 'sunburst' ? (
            <PieChart 
              onClick={(node: any) => {
                const payload = node?.activePayload ? node.activePayload[0].payload : node;
                if (onDataPointClick && payload?.originalEntries) {
                  onDataPointClick(payload.originalEntries);
                }
              }}
              style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
            >
              {/* Outer Ring: Contributors */}
              <Pie
                data={data[0]?.children?.flatMap((t: any) => t.children) || []}
                dataKey={yField}
                nameKey="name"
                innerRadius={100}
                outerRadius={140}
                paddingAngle={0.5}
                stroke="#fff"
                strokeWidth={1}
              >
                {(data[0]?.children?.flatMap((t: any) => t.children) || []).map((entry: any, index: number) => (
                  <Cell key={`cell-outer-${index}`} fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
                ))}
              </Pie>
              {/* Inner Ring: Tasks */}
              <Pie
                data={data[0]?.children || []}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                stroke="#fff"
                strokeWidth={2}
                paddingAngle={5}
              >
                {(data[0]?.children || []).map((entry: any, index: number) => (
                  <Cell key={`cell-inner-${index}`} fill={DEFAULT_COLORS[(index + 2) % DEFAULT_COLORS.length]} fillOpacity={0.8} />
                ))}
              </Pie>
              <Tooltip content={<CompactSunburstTooltip />} />
            </PieChart>
          ) : type === 'stacked_pie' ? (
            <PieChart 
              onClick={(node: any) => {
                const payload = node?.activePayload ? node.activePayload[0].payload : node;
                if (onDataPointClick && payload?.originalEntries) {
                  onDataPointClick(payload.originalEntries);
                }
              }}
              style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
            >
              {/* Task Ring (Inner) */}
              <Pie
                data={data[0]?.children || []}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={85}
                stroke="#fff"
                strokeWidth={3}
                paddingAngle={8}
                minAngle={5}
              >
                {(data[0]?.children || []).map((entry: any, index: number) => (
                  <Cell 
                    key={`cell-task-${index}`} 
                    fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} 
                  />
                ))}
              </Pie>
              {/* Contributor Ring (Outer) */}
              <Pie
                data={data[0]?.children?.flatMap((t: any, tIdx: number) => 
                  t.children.map((c: any) => ({ ...c, taskIndex: tIdx }))
                ) || []}
                dataKey={yField}
                nameKey="name"
                innerRadius={95}
                outerRadius={140}
                stroke="#fff"
                strokeWidth={1}
                paddingAngle={0.5}
                minAngle={2}
              >
                {(data[0]?.children?.flatMap((t: any, tIdx: number) => 
                  t.children.map((c: any) => ({ ...c, taskIndex: tIdx }))
                ) || []).map((entry: any, index: number) => {
                  const baseColor = DEFAULT_COLORS[entry.taskIndex % DEFAULT_COLORS.length];
                  return (
                    <Cell 
                      key={`cell-contributor-${index}`} 
                      fill={baseColor}
                      fillOpacity={0.6}
                    />
                  );
                })}
              </Pie>
              <Tooltip content={<CompactSunburstTooltip />} />
            </PieChart>
          ) : type === 'sankey' ? (
            <Sankey
              data={data}
              node={<SankeyNode />}
              nodeWidth={15}
              nodePadding={10}
              margin={{ top: 20, left: 150, right: 150, bottom: 20 }}
              onClick={(node: any) => {
                const payload = node?.activePayload ? node.activePayload[0].payload : node;
                if (onDataPointClick && payload?.originalEntries) {
                  onDataPointClick(payload.originalEntries);
                }
              }}
              style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
            >
              <Tooltip content={<CompactSankeyTooltip />} />
            </Sankey>
          ) : (
            <PieChart style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}>
              <Pie
                data={data}
                dataKey={yField}
                nameKey={xField}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                label={(props: any) => `${(props.percent * 100).toFixed(0)}%`}
                onClick={handlePointClick}
              >
                {chartData.map((_: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)' }}
                formatter={(value: any, name: any, props: any) => {
                  const formattedValue = formatYValue(value);
                  if (type === 'pie' && props.percent !== undefined) {
                    const percentValue = (props.percent * 100).toFixed(1) + '%';
                    return [`${formattedValue} (${percentValue})`, String(name || '')];
                  }
                  return [formattedValue, String(name || '')];
                }}
              />
              {!spec.hideLegend && (
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              )}
            </PieChart>
          )}
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ChartIcon({ type }: { type: string }) {
  const { BarChart2, LineChart: LineChartIcon, PieChart: PieChartIcon, Table } = require('lucide-react');
  if (type === 'bar') return <BarChart2 size={20} />;
  if (type === 'line') return <LineChartIcon size={20} />;
  if (type === 'pie') return <PieChartIcon size={20} />;
  if (type === 'coxcomb') return <PieChartIcon size={20} />;
  if (type === 'treemap') return <Table size={20} />;
  if (type === 'sunburst') return <PieChartIcon size={20} />;
  if (type === 'stacked_pie') return <PieChartIcon size={20} />;
  if (type === 'sankey') return <Table size={20} />;
  return <Table size={20} />;
}
