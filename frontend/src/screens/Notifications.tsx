import { t } from "../i18n";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import { useNotifications } from "../api/hooks";
import type { Notification } from "../api/types";
import { MainFrame, TopBar } from "../components/AppShell";

function todayIso(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function text(n: Notification): string {
  if (n.kind === "trip") {
    const base = n.date === todayIso() ? t.notifications.tripToday(n.item_count) : t.notifications.tripTomorrow(n.item_count);
    return n.hour != null ? `${base} ${t.notifications.at(`${String(n.hour).padStart(2, "0")}:00`)}` : base;
  }
  if (n.status === "out") return t.notifications.itemOut(n.name);
  if (n.status === "buy_now" || n.days_left === 0) return t.notifications.itemNow(n.name);
  return n.days_left != null ? t.notifications.itemDays(n.name, n.days_left) : n.name;
}

/** Thông báo: suy ra từ món sắp hết và chuyến mua đã hẹn (GET /notifications). */
export function Notifications() {
  const q = useNotifications();
  return (
    <MainFrame>
      <TopBar title={t.notifications.title} variant="sub" />
      <div className="page">
        {q.isPending && <p className="hint">{t.common.loading}</p>}
        {q.isError && !q.data && (
          <div className="empty">
            <h2>{t.notifications.loadFailed}</h2>
            <button className="btn btn--quiet" onClick={() => q.refetch()}>{t.common.retry}</button>
          </div>
        )}
        {q.data && q.data.length === 0 && (
          <div className="empty">
            <h2>{t.notifications.empty}</h2>
            <p>{t.notifications.emptyBody}</p>
          </div>
        )}
        {q.data && q.data.length > 0 && (
          <ul className="list">
            {q.data.map((n) => (
              <li key={n.id}>
                <Link to={n.kind === "trip" ? "/plan" : `/items/${encodeURIComponent(n.item_key)}`} className="link-row">
                  {n.kind === "trip" && <CalendarClock size={20} aria-hidden />}
                  <span className={`note ${n.kind === "item" && (n.status === "out" || n.status === "buy_now") ? "note--now" : ""}`}>{text(n)}</span>
                  <ChevronRight size={20} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainFrame>
  );
}
