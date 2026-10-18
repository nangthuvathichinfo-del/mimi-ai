import { t } from "../i18n";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Bell, BookOpen, CircleUserRound, ClipboardList, Package, ScanLine, Settings } from "lucide-react";
import { useHome } from "../api/hooks";
import { useOnline } from "../lib/useOnline";
import { MimiBrand, MimiMark } from "./MimiMark";

/* ---------- Thanh trên ---------- */

/** Màn chính: tiêu đề + chuông + tài khoản. Màn con: tiêu đề + logo Mimi về Trang chủ. */
export function TopBar({ title, variant = "main", brand = false }: { title?: string; variant?: "main" | "sub"; brand?: boolean }) {
  const home = useHome();
  const unread = home.data?.unread_notifications ?? 0;
  return (
    <header className="topbar">
      {brand ? <MimiBrand /> : title ? <h1>{title}</h1> : <span className="topbar__spacer" />}
      {variant === "main" ? (
        <>
          <Link to="/notifications" className="icon-btn" aria-label={t.nav.notifications(unread)}>
            <Bell size={24} aria-hidden />
            {unread > 0 && <span className="badge" aria-hidden>{unread}</span>}
          </Link>
          <Link to="/settings/account" className="icon-btn" aria-label={t.nav.account}>
            <CircleUserRound size={26} aria-hidden />
          </Link>
        </>
      ) : (
        <Link to="/" className="icon-btn" aria-label={t.nav.home}>
          <MimiMark size={36} label={null} />
        </Link>
      )}
    </header>
  );
}

/* ---------- Thanh dưới: năm mục theo spec ---------- */

const NAV = [
  { to: "/spending", label: t.nav.spending, Icon: BookOpen },
  { to: "/items", label: t.nav.items, Icon: Package },
  { to: "/scan", label: t.nav.scan, Icon: ScanLine, scan: true },
  { to: "/plan", label: t.nav.plan, Icon: ClipboardList },
  { to: "/settings", label: t.nav.settings, Icon: Settings },
];

export function BottomNav() {
  return (
    <nav className="nav" aria-label={t.nav.label}>
      <ul>
        {NAV.map(({ to, label, Icon, scan }) => (
          <li key={to}>
            <NavLink to={to} className={scan ? "nav__scan" : undefined}>
              <span><Icon size={scan ? 24 : 22} aria-hidden /></span>
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---------- Dải "Đang xem bản đã lưu" (spec mục 11) ---------- */

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p className="offline" role="status">
      {t.common.offline}
    </p>
  );
}

/* ---------- Hoàn tác ---------- */

type UndoState = { message: string; onUndo: () => void } | null;
const UndoCtx = createContext<(s: NonNullable<UndoState>) => void>(() => {});
export const useUndo = () => useContext(UndoCtx);

export function UndoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UndoState>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((s: NonNullable<UndoState>) => {
    window.clearTimeout(timer.current);
    setState(s);
    timer.current = window.setTimeout(() => setState(null), 6000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <UndoCtx.Provider value={show}>
      {children}
      <div aria-live="polite">
        {state && (
          <div className="undo">
            <p>{state.message}</p>
            <button
              type="button"
              onClick={() => {
                state.onUndo();
                setState(null);
              }}
            >
              {t.common.undo}
            </button>
          </div>
        )}
      </div>
    </UndoCtx.Provider>
  );
}

/* ---------- Khung cho màn có thanh dưới ---------- */

export function MainFrame({ children }: { children: ReactNode }) {
  return (
    <div className="frame frame--nav">
      <OfflineBanner />
      {children}
      <BottomNav />
    </div>
  );
}
