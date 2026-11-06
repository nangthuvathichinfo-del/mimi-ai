/**
 * Màn Phân tích chi tiêu (/spending/analytics), dựng bằng AG Studio:
 * ba trang (Tổng quan, So sánh giá, Hóa đơn), hai widget riêng của Mimi, theme Mimi và khung chat
 * "Hỏi Mimi". Màn này tải riêng (lazy) vì AG Studio nặng; màn Sổ chi tiêu thường không phải tải nó.
 * Bảng người dùng tự chỉnh được nhớ trên máy (localStorage), nút "Về bảng gốc" xóa bản đã nhớ.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Pencil, RotateCcw, Check, Sparkles } from "lucide-react";
import { AgStudioAiModule, type AgReportState, type AgStudioApi, type AgStudioMode } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AG_STUDIO_LOCALE_VN } from "ag-studio-locale";
import { uiLang } from "../i18n";
import { useAnalyticsData, studioData, type AnalyticsRows } from "./data";
import { buildAskMimi } from "./askMimi";
import { CHART_TOOLS, chartFor, ToolChart, useAutoOpenCharts } from "./chatCharts";
import { initialPhoneReport, initialReport, pageTitles, PHONE_MAX_WIDTH } from "./report";
import { mimiStudioTheme } from "./theme";
import { mimiWidgets } from "./widgets";
import { at } from "./text";
import "./analytics.css";

/** Tên dễ đọc cho các bước tool của Hỏi Mimi trong khung chat; tool có số liệu thì kèm biểu đồ. */
const toolDisplay = Object.fromEntries(
  Object.entries(at.ai.tools).map(([name, text]) => [
    name,
    CHART_TOOLS.has(name)
      ? {
          label: ({ result }: { result?: { success: boolean; response?: string } }) => ({
            text,
            ...(result?.success && result.response && chartFor(name, result.response) && { pill: at.ai.chartPill }),
          }),
          detail: ToolChart,
        }
      : { label: () => ({ text }) },
  ]),
) as never;

// Máy tính và điện thoại nhớ bảng riêng, vì bố cục hai bên khác nhau.
const storeKey = (phone: boolean) => (phone ? "mimi.analytics.report.phone.v1" : "mimi.analytics.report.v1");
const LICENSE = import.meta.env.VITE_AG_STUDIO_LICENSE as string | undefined;
const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;

/** Màn hẹp (điện thoại, hoặc cửa sổ kéo nhỏ) thì dùng bố cục một cột. */
function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

function loadSaved(phone: boolean): AgReportState | null {
  try {
    const s = localStorage.getItem(storeKey(phone));
    return s ? (JSON.parse(s) as AgReportState) : null;
  } catch {
    return null;
  }
}
function save(phone: boolean, state: AgReportState | null) {
  try {
    if (state) localStorage.setItem(storeKey(phone), JSON.stringify(state));
    else localStorage.removeItem(storeKey(phone));
  } catch {
    // trình duyệt chặn lưu: bảng vẫn chạy, chỉ không nhớ chỗ chỉnh
  }
}

export function Analytics() {
  const q = useAnalyticsData();
  const phone = useIsPhone();
  return (
    <div className="ana">
      {q.rows ? (
        q.rows.receipts.length === 0 ? (
          <Shell><div className="ana__state"><p>{at.empty}</p><Link className="btn btn--primary" to="/scan">{at.scan}</Link></div></Shell>
        ) : (
          <Dashboard key={phone ? "phone" : "desktop"} phone={phone} rows={q.rows} note={q.total > q.analysed ? at.partial(q.analysed, q.total) : undefined} />
        )
      ) : q.error && !q.isPending ? (
        <Shell><div className="ana__state"><p>{at.failed}</p><button className="btn btn--quiet" onClick={() => q.refetch()}>{at.retry}</button></div></Shell>
      ) : (
        <Shell><div className="ana__state" role="status"><span className="ana__spinner" aria-hidden />{at.loading}</div></Shell>
      )}
    </div>
  );
}

function Shell({ children, bar }: { children: React.ReactNode; bar?: React.ReactNode }) {
  return (
    <>
      <header className="ana__top">
        <Link to="/spending" className="icon-btn" aria-label={at.back}><ChevronLeft size={26} aria-hidden /></Link>
        <h1>{at.title}</h1>
        <span className="ana__spacer" />
        {bar}
      </header>
      {children}
    </>
  );
}

function Dashboard({ rows, note, phone }: { rows: AnalyticsRows; note?: string; phone: boolean }) {
  const base = phone ? initialPhoneReport : initialReport;
  const apiRef = useRef<AgStudioApi | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [mode, setMode] = useState<AgStudioMode>("view");
  // Trên điện thoại, "Hỏi Mimi" chỉ hiện khung chat, chiếm cả bề ngang (không kèm các khung chỉnh).
  const [asking, setAsking] = useState(false);
  // Bộ lọc nằm ngay trên trang nên khung Lọc bên phải thu gọn sẵn ở chế độ xem.
  const [initialState] = useState<AgReportState>(() => {
    const st = loadSaved(phone) ?? base;
    return { ...st, panels: { ...st.panels, filters: { ...st.panels?.filters, collapsed: true } } };
  });
  const [pageId, setPageId] = useState(initialState.selectedPageId);
  const [pages, setPages] = useState(() => initialState.pages.map((p) => p.id));
  const data = useMemo(() => studioData(rows), [rows]);
  // `ai` chỉ được đọc một lần lúc tạo Studio; tool đọc dữ liệu mới nhất qua rowsRef.
  const ai = useMemo(() => buildAskMimi(() => rowsRef.current), []);
  const saveTimer = useRef<number | undefined>(undefined);
  const studioRef = useRef<HTMLDivElement>(null);
  useAutoOpenCharts(studioRef);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const go = (id: string) => {
    const api = apiRef.current;
    if (api) api.setState({ ...api.getState(), selectedPageId: id });
  };
  // Khung chat của Studio chỉ có ở chế độ chỉnh: "Hỏi Mimi" mở chế độ chỉnh với khung chat mở,
  // các khung khác thu gọn để bảng vẫn rộng.
  const askMimi = () => {
    const api = apiRef.current;
    if (!api) return;
    setMode("edit");
    setAsking(true);
    // Đợi Studio dựng xong khung của chế độ chỉnh rồi mới đặt khung nào mở, khung nào gập.
    window.setTimeout(() => {
      const st = api.getState();
      api.setState({ ...st, panels: { ...st.panels, ai: { ...st.panels?.ai, collapsed: false, ...(phone && { width: window.innerWidth }) }, edit: { ...st.panels?.edit, collapsed: true }, data: { ...st.panels?.data, collapsed: true }, filters: { ...st.panels?.filters, collapsed: true } } });
    }, 50);
  };
  const reset = () => {
    save(phone, null);
    const api = apiRef.current;
    if (!api) return;
    api.setState(base);
    api.clearHistory();
    setMode("view");
    setAsking(false);
  };

  const bar = (
    <>
      <button type="button" className="btn btn--outline ana__btn" onClick={askMimi} aria-label={at.ai.agent}><Sparkles size={18} aria-hidden /> <span>{at.ai.agent}</span></button>
      <button type="button" className="btn btn--quiet ana__btn" onClick={reset} aria-label={at.reset}><RotateCcw size={18} aria-hidden /> <span>{at.reset}</span></button>
      <button type="button" className="btn btn--primary ana__btn" aria-pressed={mode === "edit"} aria-label={at.edit} onClick={() => {
          setMode(mode === "edit" ? "view" : "edit");
          setAsking(false);
        }}>
        {mode === "edit" ? <Check size={18} aria-hidden /> : <Pencil size={18} aria-hidden />} <span>{mode === "edit" ? at.done : at.edit}</span>
      </button>
    </>
  );

  return (
    <Shell bar={bar}>
      <nav className="ana__tabs" aria-label={at.title}>
        {pages.map((id) => (
          <button key={id} type="button" aria-pressed={id === pageId} onClick={() => go(id)}>{pageTitles[id] ?? id}</button>
        ))}
        {note && <span className="ana__note">{note}</span>}
      </nav>
      <div className="ana__studio" ref={studioRef}>
        <AgStudioProvider licenseKey={LICENSE} modules={[AgStudioAiModule]}>
          <AgStudio
            style={{ height: "100%", width: "100%" }}
            theme={mimiStudioTheme}
            data={data}
            widgets={mimiWidgets as never}
            ai={ai}
            initialState={initialState}
            mode={mode}
            layout={{ widgetBorderEnabled: true }}
            // Điện thoại không đủ chỗ cho khung Lọc ở chế độ xem: bộ lọc đã có ngay trên trang.
            panels={{ edit: phone && asking ? { left: ["ai"], right: [] } : { left: ["ai"], right: ["edit", "data", "filters"] }, view: { right: phone ? [] : ["filters"] } }}
            aiToolDisplay={toolDisplay}
            localeText={{ ...(uiLang === "vi" ? AG_STUDIO_LOCALE_VN : {}), panelTitleAi: at.ai.agent, aiMessageInputPlaceholder: at.ai.placeholder } as never}
            onApiReady={(e) => {
              apiRef.current = e.api;
            }}
            onStateUpdated={(e) => {
              setPageId(e.state.selectedPageId);
              setPages(e.state.pages.map((p) => p.id));
              window.clearTimeout(saveTimer.current);
              saveTimer.current = window.setTimeout(() => save(phone, e.state), 600);
            }}
          />
        </AgStudioProvider>
      </div>
    </Shell>
  );
}
