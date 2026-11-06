/**
 * Báo cáo dựng sẵn của màn Phân tích chi tiêu, dạng AgReportState. Mã trường ('lines.amount')
 * trỏ về các bảng trong ./data.ts. Lưới canvas rộng 24 cột, mỗi hàng cao studioCanvasRowHeight.
 */
import type { AgPageState, AgReportState, AgWidgetLayoutState } from "ag-studio";
import { at } from "./text";

const pos = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const countd = (id: string) => ({ id, aggregation: "countd" as const });
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const type = (fontSize: number, fontWeight: "normal" | "bold" = "normal") => ({ fontFamily: FONT, fontSize, fontWeight, fontStyle: "normal" as const });

const kpi = (text: string, value: { id: string; aggregation?: "sum" | "countd" }, sparklineX?: string) => ({
  type: "value" as const,
  dataMapping: { value: [value], ...(sparklineX && { sparklineX: [{ id: sparklineX }] }) },
  format: {
    title: { enabled: true, text, typography: type(14, "bold") },
    caption: { enabled: true, text: "", typography: type(0) },
    style: { typography: type(26, "bold") },
  },
});

export const PAGE = { overview: "overview", prices: "prices", receipts: "receipts" } as const;

const overview: AgPageState = {
  id: PAGE.overview,
  widgets: {
    period: {
      type: "button-filter",
      dataMapping: { value: [{ id: "receipts.month" }] },
      format: { ...title(at.r.dateFilter), style: { selection: { type: "multiple" }, dimensions: { height: 30, minWidth: 72 } } },
    },
    "kpi-spent": kpi(at.r.spent, sum("receipts.total"), "calendar::month"),
    "kpi-receipts": kpi(at.r.receipts, countd("receipts.id")),
    "kpi-avg": kpi(at.r.avgBill, { id: "avgReceipt" }),
    // Widget riêng của Mimi: kiểu nằm ngoài danh sách widget có sẵn nên ép kiểu.
    saved: {
      type: "mimi-money-saved",
      dataMapping: { saved: [sum("receipts.discount")], potential: [sum("prices.saving")] },
      format: title(at.saved.title),
    } as never,
    "by-month": {
      type: "column-chart-grouped",
      dataMapping: { categoryKey: [{ id: "calendar::month" }], valueKey: [sum("receipts.total")] },
      format: title(at.r.byMonth),
    },
    radar: {
      type: "mimi-runout-radar",
      dataMapping: { item: [{ id: "items.name" }], days: [{ id: "items.daysLeft", aggregation: "min" }] },
      format: title(at.radar.title),
    } as never,
    "by-category": {
      type: "donut-chart",
      dataMapping: { categoryKey: [{ id: "lines.category" }], valueKey: [sum("lines.amount")] },
      format: { ...title(at.r.byCategory), style: { custom: { pieDataLabel: { enabled: false }, totalLabel: { enabled: true } } } },
    },
    "by-store": {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [{ id: "receipts.store" }], valueKey: [sum("receipts.total")] },
      sort: [{ field: sum("receipts.total"), direction: "desc" }],
      format: title(at.r.byStore),
    },
    "top-items": {
      type: "treemap-chart",
      dataMapping: { categoryKey: [{ id: "lines.category" }, { id: "lines.name" }], valueKey: [sum("lines.amount")] },
      format: title(at.r.topItems),
    },
  },
  widgetLayout: {
    "kpi-spent": pos(0, 0, 6, 8),
    "kpi-receipts": pos(6, 0, 5, 8),
    "kpi-avg": pos(11, 0, 5, 8),
    saved: pos(16, 0, 8, 8),
    period: pos(0, 8, 24, 8),
    "by-month": pos(0, 16, 14, 18),
    radar: pos(14, 16, 10, 18),
    "by-category": pos(0, 34, 9, 18),
    "by-store": pos(9, 34, 15, 18),
    "top-items": pos(0, 52, 24, 18),
  },
};

const prices: AgPageState = {
  id: PAGE.prices,
  widgets: {
    "kpi-saving": kpi(at.saved.potential, sum("prices.saving")),
    "kpi-cheaper": kpi(at.r.cheaperCount, sum("prices.cheaperItem")),
    store: {
      type: "button-filter",
      dataMapping: { value: [{ id: "prices.store" }] },
      format: { ...title(at.r.storeFilter), style: { selection: { type: "multiple" }, dimensions: { height: 30, minWidth: 64 } } },
    },
    "price-by-store": {
      type: "column-chart-grouped",
      dataMapping: { categoryKey: [{ id: "prices.name" }], valueKey: [{ id: "prices.onlinePrice", aggregation: "min" }, { id: "prices.ownPrice", aggregation: "max" }] },
      format: { ...title(at.r.priceByStore), style: { theme: { common: { legend: { enabled: true } } } } },
    },
    "prices-grid": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "prices.name" },
          { id: "prices.store" },
          { id: "prices.source" },
          { id: "prices.size" },
          { id: "prices.onlinePrice", aggregation: "min" },
          { id: "prices.ownPrice", aggregation: "max" },
          { id: "prices.ownStore" },
          sum("prices.saving"),
          { id: "prices.cheapest" },
          { id: "prices.on" },
        ],
      },
      sort: [{ field: { id: "prices.onlinePrice", aggregation: "min" }, direction: "asc" }],
      format: { ...title(at.r.pricesGrid), style: { grandTotalRow: { enabled: false } } },
    },
  },
  widgetLayout: {
    "kpi-saving": pos(0, 0, 8, 8),
    "kpi-cheaper": pos(8, 0, 6, 8),
    store: pos(14, 0, 10, 8),
    "price-by-store": pos(0, 8, 24, 16),
    "prices-grid": pos(0, 24, 24, 24),
  },
};

const receipts: AgPageState = {
  id: PAGE.receipts,
  widgets: {
    period: {
      type: "button-filter",
      dataMapping: { value: [{ id: "receipts.month" }] },
      format: { ...title(at.r.dateFilter), style: { selection: { type: "multiple" }, dimensions: { height: 30, minWidth: 72 } } },
    },
    kind: {
      type: "button-filter",
      dataMapping: { value: [{ id: "receipts.kind" }] },
      format: { ...title(at.f.kind), style: { selection: { type: "multiple" }, dimensions: { height: 30, minWidth: 64 } } },
    },
    calendar: {
      type: "mimi-spending-calendar",
      dataMapping: { date: [{ id: "receipts.date" }], amount: [sum("receipts.total")], detail: [{ id: "receipts.store" }] },
      format: title(at.cal.title),
    } as never,
    "receipts-grid": {
      type: "grid",
      dataMapping: {
        cols: [{ id: "receipts.date" }, { id: "receipts.store" }, { id: "receipts.kind" }, { id: "receipts.buyer" }, sum("receipts.itemCount"), sum("receipts.discount"), sum("receipts.total")],
      },
      sort: [{ field: { id: "receipts.date" }, direction: "desc" }],
      format: title(at.r.receiptsGrid),
    },
    "lines-pivot": {
      type: "pivot-grid",
      dataMapping: { rows: [{ id: "lines.category" }, { id: "lines.name" }], columns: [{ id: "calendar::month" }], values: [sum("lines.amount")] },
      format: { ...title(at.r.lines), style: { totalColumns: true, totalColumnsPlacement: "after", grandTotalRow: { enabled: true } } },
    },
  },
  widgetLayout: {
    period: pos(0, 0, 14, 8),
    kind: pos(14, 0, 10, 8),
    calendar: pos(0, 8, 24, 30),
    "receipts-grid": pos(0, 38, 24, 22),
    "lines-pivot": pos(0, 60, 24, 22),
  },
};

export const initialReport: AgReportState = {
  selectedPageId: PAGE.overview,
  pages: [overview, prices, receipts],
};

export const pageTitles: Record<string, string> = {
  [PAGE.overview]: at.pages.overview,
  [PAGE.prices]: at.pages.prices,
  [PAGE.receipts]: at.pages.receipts,
};

// ---------------- Bản cho điện thoại ----------------

/** Màn hẹp hơn mức này dùng bố cục điện thoại. */
export const PHONE_MAX_WIDTH = 720;

/**
 * Bố cục điện thoại từ một báo cáo: canvas co theo màn (Studio mặc định không hẹp hơn 720px,
 * nên trên điện thoại phải cuộn ngang), widget xếp chồng một cột theo thứ tự đọc của bản máy tính.
 * Riêng ô số (KPI) đi đôi một hàng hai ô cho đỡ dài.
 */
export function toPhoneReport(report: AgReportState): AgReportState {
  return {
    ...report,
    pages: report.pages.map((page) => {
      const layout = page.widgetLayout ?? {};
      const ids = Object.keys(page.widgets ?? {}).sort((a, b) => {
        const la = layout[a];
        const lb = layout[b];
        return (la?.yTrack ?? 0) - (lb?.yTrack ?? 0) || (la?.xTrack ?? 0) - (lb?.xTrack ?? 0);
      });
      const out: Record<string, AgWidgetLayoutState> = {};
      let y = 0;
      let half: number | null = null; // ô KPI đang đứng một mình bên trái hàng
      let halfId = "";
      const widgets = { ...page.widgets };
      for (const id of ids) {
        const w = page.widgets?.[id] as { type?: string } | undefined;
        const h = layout[id]?.ySpan ?? 12;
        if (w?.type === "value") {
          widgets[id] = phoneKpi(widgets[id]);
          if (half == null) {
            out[id] = pos(0, y, 12, h);
            half = h;
            halfId = id;
          } else {
            out[id] = pos(12, y, 12, h);
            y += Math.max(half, h);
            half = null;
          }
          continue;
        }
        if (half != null) {
          // ô KPI lẻ cuối hàng thì trải rộng cả hàng
          out[halfId] = { ...out[halfId], xSpan: 24 };
          y += half;
          half = null;
        }
        // Bộ lọc nút trên màn hẹp xuống hàng nên cần cao hơn một chút; bảng cần chỗ để cuộn.
        const ySpan = w?.type === "button-filter" ? Math.max(h, 10) : w?.type === "grid" || w?.type === "pivot-grid" ? Math.max(h, 26) : w?.type === "mimi-spending-calendar" ? Math.max(h, 46) : h;
        out[id] = pos(0, y, 24, ySpan);
        y += ySpan;
      }
      if (half != null) out[halfId] = { ...out[halfId], xSpan: 24 };
      return { ...page, widgets, layout: { ...page.layout, minWidth: 300 }, widgetLayout: out };
    }),
  };
}

/** Ô số trên điện thoại chỉ rộng nửa màn, nên chữ số nhỏ lại để số tiền không bị cắt thành "...". */
function phoneKpi<T>(widget: T): T {
  const w = widget as { format?: { style?: { typography?: Record<string, unknown> } } };
  const typography = w.format?.style?.typography;
  if (!typography) return widget;
  return { ...w, format: { ...w.format, style: { ...w.format?.style, typography: { ...typography, fontSize: 19 } } } } as T;
}

export const initialPhoneReport = toPhoneReport(initialReport);
