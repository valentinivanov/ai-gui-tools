import React, { useSyncExternalStore } from "react";
import type { AgentUI as AgentUICore, FormField, TreeNode, UIEvent, View, Widget } from "@agentui/core";
import "./styles.css";

export interface AgentUIProps {
  ui: AgentUICore;
  className?: string;
  empty?: React.ReactNode;
}

export function AgentUI({ ui, className, empty = null }: AgentUIProps): React.ReactElement {
  const state = useSyncExternalStore(
    (listener) => ui.subscribe(listener),
    () => ui.getState(),
    () => ui.getState()
  );

  if (state.views.length === 0) {
    return <div className={classNames("agentui", className)}>{empty}</div>;
  }

  return (
    <div className={classNames("agentui", className)}>
      {state.views.map((view) => (
        <AgentUIView key={view.id} ui={ui} view={view} />
      ))}
    </div>
  );
}

function AgentUIView({ ui, view }: { ui: AgentUICore; view: View }): React.ReactElement {
  return (
    <section className="agentui-view" data-view-id={view.id}>
      {view.title ? <h2>{view.title}</h2> : null}
      <div className="agentui-stack">
        {view.children.map((widget, index) => (
          <WidgetRenderer key={widgetKey(widget, index)} ui={ui} widget={widget} />
        ))}
      </div>
    </section>
  );
}

function WidgetRenderer({ ui, widget }: { ui: AgentUICore; widget: Widget }): React.ReactElement {
  switch (widget.type) {
    case "text":
      return <p className="agentui-text">{widget.text}</p>;
    case "markdown":
      return <Markdown markdown={widget.markdown} />;
    case "button":
      return (
        <button className={`agentui-button agentui-button-${widget.variant ?? "secondary"}`} onClick={() => emit(ui, { type: "click", id: widget.id })}>
          {widget.label}
        </button>
      );
    case "checkbox":
      return (
        <label className="agentui-check">
          <input type="checkbox" checked={Boolean(widget.checked)} onChange={(event) => emit(ui, { type: "change", id: widget.id, value: event.currentTarget.checked })} />
          <span>{widget.label}</span>
        </label>
      );
    case "select":
      return (
        <label className="agentui-field">
          {widget.label ? <span>{widget.label}</span> : null}
          <select value={widget.value ?? ""} onChange={(event) => emit(ui, { type: "change", id: widget.id, value: event.currentTarget.value })}>
            <option value="" disabled>
              Select...
            </option>
            {widget.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "input":
      return (
        <label className="agentui-field">
          {widget.label ? <span>{widget.label}</span> : null}
          <input
            type={widget.inputType ?? "text"}
            placeholder={widget.placeholder}
            value={widget.value ?? ""}
            onChange={(event) => emit(ui, { type: "change", id: widget.id, value: coerceInputValue(event.currentTarget.value, widget.inputType) })}
          />
        </label>
      );
    case "form":
      return <FormWidget ui={ui} widget={widget} />;
    case "plot":
      return <PlotWidgetView widget={widget} />;
    case "separator":
      return <div className="agentui-separator" aria-hidden="true" />;
    case "container":
      return (
        <div className="agentui-container">
          {widget.title ? <h3>{widget.title}</h3> : null}
          {widget.children.map((child, index) => (
            <WidgetRenderer key={widgetKey(child, index)} ui={ui} widget={child} />
          ))}
        </div>
      );
    case "table":
      const tableName = tableDisplayName(widget);
      return (
        <div className="agentui-table-wrap">
          <table className="agentui-table">
            <thead>
              {tableName ? (
                <tr>
                  <th className="agentui-table-name" colSpan={Math.max(widget.columns.length, 1)}>
                    {tableName}
                  </th>
                </tr>
              ) : null}
              <tr>
                {widget.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {widget.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {widget.columns.map((column, columnIndex) => (
                    <td key={column.key}>{formatCellValue(cellValue(row, column, columnIndex))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "tree":
      return (
        <ul className="agentui-tree">
          {widget.nodes.map((node) => (
            <TreeNodeView key={node.id} node={node} />
          ))}
        </ul>
      );
    case "tabs":
      return (
        <div className="agentui-tabs">
          <div className="agentui-tab-list">
            {widget.tabs.map((tab) => (
              <button
                key={tab.id}
                className={tab.id === (widget.activeTabId ?? widget.tabs[0]?.id) ? "is-active" : ""}
                onClick={() => emit(ui, { type: "change", id: widget.id, value: tab.id })}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {widget.tabs
            .filter((tab) => tab.id === (widget.activeTabId ?? widget.tabs[0]?.id))
            .map((tab) => (
              <div key={tab.id} className="agentui-tab-panel">
                {tab.children.map((child, index) => (
                  <WidgetRenderer key={widgetKey(child, index)} ui={ui} widget={child} />
                ))}
              </div>
            ))}
        </div>
      );
    case "progress":
      return (
        <div className="agentui-progress">
          {widget.label ? <div className="agentui-progress-label">{widget.label}</div> : null}
          <progress value={widget.value} max={widget.max ?? 100} />
          {widget.status ? <div className="agentui-progress-status">{widget.status}</div> : null}
        </div>
      );
    case "diff":
      return (
        <div className="agentui-diff">
          {widget.files.map((file) => (
            <details key={file.path} open>
              <summary>{file.path}</summary>
              <DiffLines text={file.patch ?? buildInlineDiff(file.oldText, file.newText)} />
            </details>
          ))}
        </div>
      );
    case "confirmation":
      return (
        <div className="agentui-confirm">
          <h3>{widget.title}</h3>
          {widget.message ? <p>{widget.message}</p> : null}
          <div className="agentui-actions">
            <button className="agentui-button agentui-button-secondary" onClick={() => emit(ui, { type: "click", id: `${widget.id}:cancel` })}>
              {widget.cancelLabel ?? "Cancel"}
            </button>
            <button className="agentui-button agentui-button-primary" onClick={() => emit(ui, { type: "click", id: `${widget.id}:confirm` })}>
              {widget.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>
      );
  }
}

function cellValue(row: Record<string, string | number | boolean | null | undefined>, column: { key: string; label: string }, columnIndex: number): unknown {
  if (Array.isArray(row)) return row[columnIndex];
  if (!row || typeof row !== "object") return columnIndex === 0 ? row : undefined;
  if (row[column.key] !== undefined) return row[column.key];
  if (row[column.label] !== undefined) return row[column.label];
  const match = Object.keys(row).find((key) => key.toLowerCase() === column.key.toLowerCase() || key.toLowerCase() === column.label.toLowerCase());
  if (match) return row[match];
  return Object.values(row)[columnIndex];
}

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function tableDisplayName(widget: Extract<Widget, { type: "table" }>): string {
  const value =
    widget.name ??
    (widget as typeof widget & { tableName?: string | undefined }).tableName ??
    (widget as typeof widget & { title?: string | undefined }).title ??
    (widget as typeof widget & { caption?: string | undefined }).caption;
  return typeof value === "string" ? value : "";
}

function DiffLines({ text }: { text: string }): React.ReactElement {
  return (
    <pre className="agentui-diff-lines">
      {text.split("\n").map((line, index) => (
        <div key={index} className={`agentui-diff-line ${diffLineClass(line)}`}>
          {line.length > 0 ? line : " "}
        </div>
      ))}
    </pre>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "is-added";
  if (line.startsWith("-") && !line.startsWith("---")) return "is-removed";
  return "";
}

function PlotWidgetView({ widget }: { widget: Extract<Widget, { type: "plot" }> }): React.ReactElement {
  const points = normalizedPlotPoints(widget.points);
  const plot = points.length > 0 ? plotScale(points) : undefined;
  return (
    <div className="agentui-plot">
      {widget.title ? <h3>{widget.title}</h3> : null}
      <svg viewBox="0 0 640 280" role="img" aria-label={widget.title ?? "Plot"}>
        {points.length === 0 || !plot ? (
          <text x="320" y="140" textAnchor="middle" fill="#64748b">
            No data
          </text>
        ) : (
          <>
            <PlotAxes plot={plot} />
            {widget.mode === "lines" ? <polyline className="agentui-plot-line" points={points.map((point) => `${plot.x(point.x)},${plot.y(point.y)}`).join(" ")} /> : null}
            {widget.mode === "bars"
              ? points.map((point, index) => (
                  <line key={index} className="agentui-plot-bar" x1={plot.x(point.x)} x2={plot.x(point.x)} y1={plot.xAxisY} y2={plot.y(point.y)} />
                ))
              : points.map((point, index) => <circle key={index} className="agentui-plot-point" cx={plot.x(point.x)} cy={plot.y(point.y)} r="4" />)}
          </>
        )}
      </svg>
    </div>
  );
}

function PlotAxes({ plot }: { plot: PlotScale }): React.ReactElement {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => {
        const y = plot.top + (plot.height / 4) * index;
        return <line key={index} className="agentui-plot-grid" x1={plot.left} x2={plot.left + plot.width} y1={y} y2={y} />;
      })}
      {plot.xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line className="agentui-plot-tick" x1={plot.x(tick)} x2={plot.x(tick)} y1={plot.xAxisY - 4} y2={plot.xAxisY + 4} />
          <text className="agentui-plot-label" x={plot.x(tick)} y={Math.min(plot.xAxisY + 18, plot.top + plot.height + 24)} textAnchor="middle">
            {formatTick(tick)}
          </text>
        </g>
      ))}
      {plot.yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line className="agentui-plot-tick" x1={plot.yAxisX - 4} x2={plot.yAxisX + 4} y1={plot.y(tick)} y2={plot.y(tick)} />
          <text className="agentui-plot-label" x={Math.max(plot.yAxisX - 8, 8)} y={plot.y(tick) + 4} textAnchor="end">
            {formatTick(tick)}
          </text>
        </g>
      ))}
      <line className="agentui-plot-axis" x1={plot.left} x2={plot.left + plot.width} y1={plot.xAxisY} y2={plot.xAxisY} />
      <line className="agentui-plot-axis" x1={plot.yAxisX} x2={plot.yAxisX} y1={plot.top} y2={plot.top + plot.height} />
    </>
  );
}

function normalizedPlotPoints(points: Array<{ x: number; y: number } | [number, number]>): Array<{ x: number; y: number }> {
  return points
    .map((point) => (Array.isArray(point) ? { x: Number(point[0]), y: Number(point[1]) } : { x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function plotScale(points: Array<{ x: number; y: number }>): PlotScale {
  let minX = Math.min(...points.map((point) => point.x));
  let maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const xTicks = axisTicks(minX, maxX);
  const yTicks = axisTicks(minY, maxY);
  const padX = (maxX - minX) * 0.05;
  const padY = (maxY - minY) * 0.08;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  const left = 58;
  const top = 16;
  const width = 548;
  const height = 210;
  const xScale = (value: number) => left + ((value - minX) / (maxX - minX)) * width;
  const yScale = (value: number) => top + height - ((value - minY) / (maxY - minY)) * height;
  return {
    left,
    top,
    width,
    height,
    xTicks,
    yTicks,
    xAxisY: clamp(yScale(0), top, top + height),
    yAxisX: clamp(xScale(0), left, left + width),
    x: xScale,
    y: yScale
  };
}

function axisTicks(min: number, max: number): number[] {
  const unit = axisUnit(min, max);
  const start = min <= 0 && max >= 0 ? Math.ceil(min / unit) * unit : min > 0 ? min : max;
  const end = min <= 0 && max >= 0 ? Math.floor(max / unit) * unit : min > 0 ? max : min;
  const step = min <= 0 && max >= 0 || min > 0 ? unit : -unit;
  const ticks: number[] = [];
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    ticks.push(normalizeTick(value));
  }
  return ticks.sort((a, b) => a - b);
}

function axisUnit(min: number, max: number): number {
  return Math.max(unitForMagnitude(Math.max(0, max)), unitForMagnitude(Math.max(0, -min)));
}

function unitForMagnitude(value: number): number {
  if (value < 10) return 1;
  return 10 ** Math.floor(Math.log10(value));
}

function formatTick(value: number): string {
  return String(normalizeTick(value));
}

function normalizeTick(value: number): number {
  const normalized = Object.is(value, -0) ? 0 : value;
  return Math.abs(normalized) < 1e-10 ? 0 : Number(normalized.toPrecision(12));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface PlotScale {
  left: number;
  top: number;
  width: number;
  height: number;
  xTicks: number[];
  yTicks: number[];
  xAxisY: number;
  yAxisX: number;
  x(value: number): number;
  y(value: number): number;
}

function FormWidget({ ui, widget }: { ui: AgentUICore; widget: Extract<Widget, { type: "form" }> }): React.ReactElement {
  return (
    <form
      className="agentui-form"
      onSubmit={(event) => {
        event.preventDefault();
        emit(ui, { type: "submit", id: widget.id, values: formValues(widget.fields) });
      }}
    >
      {widget.title ? <h3>{widget.title}</h3> : null}
      {widget.description ? <p>{widget.description}</p> : null}
      {widget.fields.map((field) => (
        <FormFieldView key={field.id} ui={ui} field={field} />
      ))}
      <div className="agentui-actions">
        <button className="agentui-button agentui-button-secondary" type="button" onClick={() => emit(ui, { type: "click", id: `${widget.id}:cancel` })}>
          {widget.cancelLabel ?? "Cancel"}
        </button>
        <button className="agentui-button agentui-button-primary" type="submit">
          {widget.submitLabel ?? "Submit"}
        </button>
      </div>
    </form>
  );
}

function FormFieldView({ ui, field }: { ui: AgentUICore; field: FormField }): React.ReactElement {
  if (field.type === "checkbox") {
    return (
      <label className="agentui-check">
        <input type="checkbox" checked={Boolean(field.checked)} onChange={(event) => emit(ui, { type: "change", id: field.id, value: event.currentTarget.checked })} />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="agentui-field">
        <span>{field.label}</span>
        <select required={field.required} value={field.value ?? ""} onChange={(event) => emit(ui, { type: "change", id: field.id, value: event.currentTarget.value })}>
          <option value="" disabled>
            Select...
          </option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="agentui-field">
      <span>{field.label}</span>
      <input
        required={field.required}
        type={field.inputType ?? "text"}
        placeholder={field.placeholder}
        value={field.value ?? ""}
        onChange={(event) => emit(ui, { type: "change", id: field.id, value: coerceInputValue(event.currentTarget.value, field.inputType) })}
      />
    </label>
  );
}

function TreeNodeView({ node }: { node: TreeNode }): React.ReactElement {
  return (
    <li>
      <span>{node.label}</span>
      {node.children?.length ? (
        <ul>
          {node.children.map((child) => (
            <TreeNodeView key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Markdown({ markdown }: { markdown: string }): React.ReactElement {
  return (
    <div className="agentui-markdown">
      {markdown.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function emit(ui: AgentUICore, event: UIEvent): void {
  ui.handleEvent(event);
}

function formValues(fields: FormField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.type === "checkbox") return [field.id, Boolean(field.checked)];
      if (field.type === "input") return [field.id, field.value ?? ""];
      return [field.id, field.value ?? ""];
    })
  );
}

function coerceInputValue(value: string, inputType: string | undefined): string | number {
  if (inputType !== "number") {
    return value;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function buildInlineDiff(oldText = "", newText = ""): string {
  if (!oldText && !newText) {
    return "";
  }
  return [`--- before`, oldText, `+++ after`, newText].join("\n");
}

function widgetKey(widget: Widget, index: number): string {
  return "id" in widget && typeof widget.id === "string" ? widget.id : `${widget.type}:${index}`;
}

function classNames(...names: Array<string | undefined>): string {
  return names.filter(Boolean).join(" ");
}
