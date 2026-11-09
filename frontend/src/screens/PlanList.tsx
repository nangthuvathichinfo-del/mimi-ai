import { s22 } from "../i18n/s22";
import { m15 } from "../i18n/m15";
import { useLayoutEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ChevronRight, Info, MapPin, Plus, UsersRound } from "lucide-react";
import { useDelegated, useOrders, usePlan, usePlanCarts, usePlanMeta, usePlans } from "../api/hooks";
import type { Cart, PlanMeta } from "../api/types";
import { MainFrame, TopBar } from "../components/AppShell";
import { setCurrentPlanId, useCurrentPlanId } from "../lib/currentPlan";
import { visiblePlans } from "../components/PlanPicker";
import { iconOf, planIcon } from "../lib/planIcon";
import { buyerOf, isDraft, usePlanDraftVersion } from "../lib/planDraft";
import { Stepper, SuggestGrid } from "../components/PlanDraft22";
import { NextButton, Step1Body } from "./PlanFlow22";
import { p22 } from "../i18n/p22";
import { formatDayMonth, formatVnd } from "../lib/text";
import { t } from "../i18n";
import { LoadState } from "../components/LoadState";

const pad = (n: number) => String(n).padStart(2, "0");

export function planName(p: Pick<PlanMeta, "default" | "name">) {
  return p.default ? m15.plan.main : p.name;
}

export function whenText(st: Cart["state"] | undefined): string {
  if (!st?.buy_date) return m15.plan.noDate;
  const time = st.buy_hour != null ? ` · ${pad(st.buy_hour)}:${pad(st.buy_minute ?? 0)}` : "";
  return formatDayMonth(st.buy_date) + time;
}

/**
 * Kế hoạch mua sắm. Mimi 2.2 (đề xuất chốt 09/11): ba tab Của tôi, Được nhờ mua, Tất cả đơn (T5).
 * Tab Được nhờ mua giữ như 2.1 (anh chốt 09/11): danh sách kế hoạch được nhờ, nhận hoặc từ chối trong màn đi mua.
 * Tab Của tôi: trên cùng là kế hoạch chưa lưu, hiện sẵn đầy đủ như Redesign (T1); bên dưới là kế hoạch
 * đã lưu hoặc đang triển khai dạng thẻ gọn (bấm mới xem chi tiết). Kế hoạch đã mua xong chỉ nằm ở
 * tab Tất cả đơn (anh chốt 09/11: Của tôi chỉ có kế hoạch chưa mua).
 */
export function PlanList() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab = raw === "to-me" ? "to-me" : raw === "orders" ? "orders" : "mine";
  const toMe = (useDelegated().data?.to_me ?? []).filter((a) => a.status === "assigned").length;
  return (
    <MainFrame>
      <TopBar title={m15.plan.title} sub={s22.heads.plans} showTitle />
      <div className="page p15">
        <div className="seg seg15 seg22--3" role="group" aria-label={m15.plan.title}>
          <button type="button" aria-pressed={tab === "mine"} onClick={() => setParams({}, { replace: true })}>{p22.tabs.mine}</button>
          <button type="button" aria-pressed={tab === "to-me"} onClick={() => setParams({ tab: "to-me" }, { replace: true })}>
            {m15.plan.toMe}
            {toMe > 0 && <span className="badge15" aria-label={m15.run.newBadge(toMe)}>{toMe}</span>}
          </button>
          <button type="button" aria-pressed={tab === "orders"} onClick={() => setParams({ tab: "orders" }, { replace: true })}>{p22.tabs.orders}</button>
        </div>
        {tab === "mine" ? <Mine /> : tab === "to-me" ? <ToMe /> : <AllOrders />}
      </div>
    </MainFrame>
  );
}

/** Kế hoạch chưa lưu: đang sửa dở (nháp), giỏ trống, hoặc chưa từng chọn người mua và chưa gửi ai. */
function isUnsaved(p: PlanMeta, c: Cart | undefined, sent: boolean): boolean {
  if (isDraft(p.id)) return true;
  if (sent || (c?.phase ?? "planning") !== "planning") return false;
  return (c?.item_count ?? p.item_count) === 0 || !buyerOf(p.id);
}

function Mine() {
  const plans = usePlans();
  const meta = usePlanMeta();
  const nav = useNavigate();
  const delegated = useDelegated();
  const current = useCurrentPlanId();
  const active = (plans.data ?? []).filter((p) => p.status === "active");
  const carts = usePlanCarts(active.map((p) => p.id));
  const [err, setErr] = useState(false);
  usePlanDraftVersion();
  const saved = (useLocation().state as { saved?: unknown } | null)?.saved;
  const rows = active.map((p, i) => ({ p, c: carts[i]?.data }));
  const sentOf = (id: string) => (delegated.data?.from_me ?? []).find((a) => a.plan_id === id && (a.status === "assigned" || a.status === "shopping"));
  const unsaved = rows.filter(({ p, c }) => isUnsaved(p, c, !!sentOf(p.id)));
  const top = unsaved.find((r) => r.p.id === current) ?? unsaved.find((r) => r.p.default) ?? unsaved[0];
  // Các hook của thẻ đầu đọc "Kế hoạch đang xem": chuyển sang kế hoạch chưa lưu trước khi vẽ thẻ.
  useLayoutEffect(() => {
    if (top && current !== top.p.id) setCurrentPlanId(top.p.id);
  }, [top?.p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (id: string) => {
    setCurrentPlanId(id);
    nav(`/plan/${encodeURIComponent(id)}`);
  };
  const createNew = () => {
    if (meta.create.isPending) return;
    const d = new Date();
    const name = m15.plan.newName(`${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
    meta.create.mutate(name, { onSuccess: (p) => setCurrentPlanId(p.id), onError: () => setErr(true) });
  };
  if (!plans.data) return <LoadState q={plans} hasData={false} />;
  const visible = new Set(visiblePlans(plans.data).map((p) => p.id));
  const rest = rows.filter((r) => r !== top && visible.has(r.p.id));
  const going = rest.filter((r) => r.c?.phase !== "reconciled");
  return (
    <>
      {typeof saved === "string" && <p className="sent15" role="status">{saved}</p>}
      <div className="sec22">
        <h2 className="h15sec">{p22.current}</h2>
        <button type="button" className="pill22 sec22__new" aria-disabled={meta.create.isPending || undefined} onClick={createNew}>
          <Plus size={18} aria-hidden /> {p22.newPlan}
        </button>
      </div>
      {top && current === top.p.id ? (
        <>
          <TopDraft id={top.p.id} />
          <SuggestGrid meta={top.p} />
        </>
      ) : (
        !top && <p className="hint">{m15.plan.mineEmpty}</p>
      )}
      {err && <p className="error" role="alert">{t.common.genericError}</p>}

      <h2 className="h15sec">{p22.saved}</h2>
      {going.length === 0 && <p className="hint">{p22.noSaved}</p>}
      <ul className="plans15">
        {going.map(({ p, c }) => {
          const Icon = iconOf(planIcon(p));
          const buyer = sentOf(p.id)?.buyer_display_name;
          const count = c?.item_count ?? p.item_count;
          // Câu 5: người được nhờ đã từ chối mà chưa gửi cho ai khác.
          const declined = !buyer && (delegated.data?.from_me ?? []).some((x) => x.plan_id === p.id && x.status === "declined");
          return (
            <li key={p.id}>
              <button type="button" className="plancard15" onClick={() => open(p.id)} aria-label={m15.plan.open(planName(p))}>
                <span className="plancard15__icon"><Icon size={26} aria-hidden /></span>
                <span className="plancard15__body">
                  <span className="plancard15__name">{planName(p)}</span>
                  <span className="plancard15__sub">
                    {m15.plan.count(count)}
                    {c?.estimate != null && ` · ${m15.plan.budget(formatVnd(c.estimate))}`}
                  </span>
                  <span className="plancard15__sub"><MapPin size={15} aria-hidden /> {c?.state.trip_note || m15.plan.noStore} · <CalendarDays size={15} aria-hidden /> {whenText(c?.state)}</span>
                  <span className="plancard15__tags">
                    {isDraft(p.id) ? (
                      <span className="tag15 tag15--draft">{m15.plan.draft}</span>
                    ) : (
                      <span className="tag15">{m15.plan.phase[buyer ? "shopping" : (c?.phase ?? "planning")]}</span>
                    )}
                    {buyer && <span className="tag15 tag15--buyer">{m15.plan.buyer(buyer)}</span>}
                    {declined && <span className="tag15 tag15--draft">{m15.plan.noBuyer}</span>}
                  </span>
                </span>
                <ChevronRight size={22} aria-hidden className="plancard15__chev" />
              </button>
            </li>
          );
        })}
      </ul>

      <p className="hint hint15"><Info size={16} aria-hidden /> {m15.plan.note}</p>
    </>
  );
}

type OrderKind = "doing" | "bought" | "online" | "asks";
type OrderRow = { id: string; kinds: OrderKind[]; title: string; date: string; count: number; total: number | null; tag: string; done: boolean; open: () => void };

/**
 * Tab Tất cả đơn (anh chốt 09/11): lưu mọi kế hoạch đã lên, đang làm, đã mua, kế hoạch được người
 * khác nhờ mua và đơn online, mới nhất trước. Bộ lọc: Tất cả, Đang làm, Đã mua, Online, Nhờ mua.
 */
function AllOrders() {
  const orders = useOrders();
  const plans = usePlans();
  const d = useDelegated();
  const nav = useNavigate();
  const [f, setF] = useState<"all" | OrderKind>("all");
  // Kế hoạch đang dùng (trừ Giỏ mua sắm trống) và kế hoạch đã xác nhận mua xong (archived).
  const list = (plans.data ?? []).filter((p) => p.status === "archived" || visiblePlans([p]).length > 0);
  const carts = usePlanCarts(list.map((p) => p.id));
  const openPlan = (id: string) => { setCurrentPlanId(id); nav(`/plan/${encodeURIComponent(id)}`); };
  const sentOf = (id: string) => (d.data?.from_me ?? []).filter((a) => a.plan_id === id && a.status !== "cancelled").pop();
  const rows: OrderRow[] = [
    ...list.map((p, i) => {
      const c = carts[i]?.data;
      // Hoàn thành khi quét hóa đơn khớp (reconciled) hoặc người dùng tự xác nhận (archived).
      const bought = c?.phase === "reconciled" || p.status === "archived";
      const sent = sentOf(p.id);
      const day = ((bought ? c?.state.reconciled_on : "") || c?.state.buy_date || "").slice(0, 10);
      const tag = bought ? p22.completed : isDraft(p.id) ? m15.plan.draft : sent ? m15.plan.buyer(sent.buyer_display_name) : p22.pending;
      const kinds: OrderKind[] = [bought ? "bought" : "doing", ...(sent ? (["asks"] as const) : [])];
      return { id: `p:${p.id}`, kinds, title: planName(p), date: day, count: c?.item_count ?? p.item_count, total: c?.estimate ?? null, tag, done: bought, open: () => openPlan(p.id) };
    }),
    ...(d.data?.to_me ?? []).map((a) => {
      const done = a.status === "completed" || a.status === "closed_partial" || a.status === "declined" || a.status === "cancelled";
      return {
        id: `a:${a.assignment_id}`, kinds: ["asks", done ? "bought" : "doing"] as OrderKind[], title: a.trip?.plan_name && a.trip.plan_name !== "Kế hoạch chính" ? a.trip.plan_name : m15.plan.main,
        date: (a.trip?.buy_date || a.updated_at || a.created_at).slice(0, 10), count: a.items.length, total: null,
        tag: `${m15.plan.from(a.owner_display_name)} · ${p22.askStatus[a.status] ?? a.status}`, done, open: () => nav(`/plan/run/${encodeURIComponent(a.assignment_id)}`),
      };
    }),
    ...(orders.data ?? []).map((o) => ({
      id: `o:${o.id}`, kinds: ["online", o.state === "verified" ? "bought" : "doing"] as OrderKind[], title: o.merchant,
      date: (o.paid_at ?? o.events[0]?.at ?? "").slice(0, 10), count: o.lines.length, total: o.total_vnd, tag: t.orders.states[o.state],
      done: o.state === "verified", open: () => nav(`/orders/${encodeURIComponent(o.id)}`),
    })),
  ]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const spent = rows.reduce((s, r) => s + (r.done && r.total != null ? r.total : 0), 0);
  const shown = rows.filter((r) => f === "all" || r.kinds.includes(f));
  if (plans.isPending) return <p className="hint">{t.common.loading}</p>;
  return (
    <>
      <div className="ord22__stats">
        <div className="box15"><small>{p22.spent}</small><b className="num">{formatVnd(spent)}</b></div>
        <div className="box15"><small>{p22.tabs.orders}</small><b>{p22.ordersCount(rows.length, rows.filter((r) => !r.done).length)}</b></div>
      </div>
      <div className="chips22" role="group" aria-label={p22.tabs.orders}>
        {(["all", "doing", "bought", "online", "asks"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{p22.filters[k]}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="hint">{p22.ordersEmpty}</p>
      ) : (
        <ul className="box15 past22">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" className="past22__row" onClick={r.open}>
                {r.done && <span className="past22__ok" aria-hidden><Check size={20} /></span>}
                <span className="past22__text">
                  <b>{r.title}</b>
                  <small>{[r.date ? formatDayMonth(r.date) : "", m15.plan.count(r.count)].filter(Boolean).join(" · ")}</small>
                  {!r.done && <small className="ord22__hint">{r.kinds.includes("online") ? p22.onlineHint : r.kinds.includes("asks") && r.id.startsWith("a:") ? "" : p22.pendingHint}</small>}
                </span>
                <span className="past22__end">
                  {r.total != null && <span className="num past22__sum">{formatVnd(r.total)}</span>}
                  <span className="tag15">{r.tag}</span>
                </span>
                <ChevronRight size={20} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
/** Được nhờ mua: bấm thẻ mở màn đi mua (Spec 1.5 mục 2). */
function ToMe() {
  const d = useDelegated();
  const nav = useNavigate();
  const list = d.data?.to_me ?? [];
  if (d.isPending) return <p className="hint">{t.common.loading}</p>;
  if (list.length === 0) return <p className="hint">{m15.plan.toMeEmpty}</p>;
  return (
    <ul className="plans15">
      {list.map((a) => {
        const n = a.items.filter((i) => i.status === "assigned").length;
        const st = a.trip ? { buy_date: a.trip.buy_date ?? "", buy_hour: a.trip.buy_hour ?? null, buy_minute: a.trip.buy_minute ?? 0, trip_note: a.trip.trip_note ?? "" } : undefined;
        return (
          <li key={a.assignment_id}>
            <button type="button" className="plancard15" onClick={() => nav(`/plan/run/${encodeURIComponent(a.assignment_id)}`)}>
              <span className="plancard15__icon"><UsersRound size={26} aria-hidden /></span>
              <span className="plancard15__body">
                <span className="plancard15__name">{a.trip?.plan_name && a.trip.plan_name !== "Kế hoạch chính" ? a.trip.plan_name : m15.plan.main}</span>
                <span className="plancard15__sub">{m15.plan.from(a.owner_display_name)} · {m15.plan.count(n)}</span>
                <span className="plancard15__sub"><MapPin size={15} aria-hidden /> {st?.trip_note || m15.plan.noStore}</span>
                <span className="plancard15__sub"><CalendarDays size={15} aria-hidden /> {whenText(st)}</span>
                <span className="plancard15__sub">{m15.run.sender(a.owner_display_name)}</span>
              </span>
              <ChevronRight size={22} aria-hidden className="plancard15__chev" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Kế hoạch chưa lưu ở đầu tab Của tôi: chính là màn bước 1 (Thêm món), cuối có nút Tiếp tục. */
function TopDraft({ id }: { id: string }) {
  const plan = usePlan();
  const cart = plan.data;
  if (!cart) return <LoadState q={plan} hasData={false} />;
  return (
    <section className="top22" aria-label={p22.current}>
      <Stepper step={1} />
      <Step1Body id={id} cart={cart} />
      <NextButton id={id} cart={cart} />
    </section>
  );
}
