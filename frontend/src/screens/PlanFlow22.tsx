import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Bot, Check, ChevronLeft, CircleCheckBig, ExternalLink, Plus, Store, UserRound } from "lucide-react";
import { p22 } from "../i18n/p22";
import { m15 } from "../i18n/m15";
import { t } from "../i18n";
import { ApiError } from "../api/client";
import {
  useAssignments, useDelegated, useHousehold, useItems, useMarketPrices, useMe, usePlan, usePlanItem, usePlans, useSavePlanState,
} from "../api/hooks";
import type { Cart, CartItem, MarketPrice } from "../api/types";
import { MainFrame } from "../components/AppShell";
import { CategoryIcon } from "../components/ItemRow";
import { AddAnything, BasketPricesPanel, MarketPricesPanel } from "../components/PlanExtras";
import { Stepper } from "../components/PlanDraft22";
import { LoadState } from "../components/LoadState";
import { setCurrentPlanId, useCurrentPlanId } from "../lib/currentPlan";
import { goodsTier, savedUnit, unitLabel } from "../lib/displayUnit";
import { buyerOf, clearDraft, markDraft, setBuyer, usePlanDraftVersion } from "../lib/planDraft";
import { useRelations } from "../lib/relation";
import { formatDayMonth, formatVnd } from "../lib/text";
import { planName } from "./PlanList";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : t.common.genericError);

/* ---------- Giá đã chọn cho từng món (T3): lưu trên máy như bản nháp ---------- */
const PICK = (id: string) => `mimi.planPick.${id}`;
function readPicks(id: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PICK(id)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function writePicks(id: string, v: Record<string, string>) {
  try {
    localStorage.setItem(PICK(id), JSON.stringify(v));
  } catch {
    // không lưu được thì chỉ nhớ trên màn này
  }
}

export type PriceOption = { id: string; store: string; sub: string; total: number; url?: string; receipt: boolean };

/** Các lựa chọn giá của một món: hóa đơn cũ của nhà mình và giá đang bán trên mạng, rẻ nhất trước. */
export function optionsOf(item: CartItem, prices: MarketPrice[]): PriceOption[] {
  const out: PriceOption[] = [];
  if (item.unit_price != null)
    out.push({ id: "receipt", store: item.best_store || p22.pastReceipt(""), sub: p22.pastReceipt(""), total: item.unit_price * item.qty, receipt: true });
  prices.forEach((p, i) =>
    out.push({ id: `web:${i}:${p.store}`, store: p.store, sub: [p22.online, p.size, formatDayMonth(p.on)].filter(Boolean).join(" · "), total: p.price_vnd * item.qty, url: p.url, receipt: false }),
  );
  return out.sort((a, b) => a.total - b.total);
}

function chosen(item: CartItem, opts: PriceOption[], picks: Record<string, string>): PriceOption | undefined {
  return opts.find((o) => o.id === picks[item.key]) ?? opts[0];
}

/** Khung chung của luồng 3 bước: đặt Kế hoạch đang xem theo đường dẫn, ẩn thanh tab, nút quay lại. */
function Flow({ step, title, back, children, bar }: { step: 1 | 2 | 3; title: string; back: string; children: (id: string, cart: Cart) => ReactNode; bar?: (id: string, cart: Cart) => ReactNode }) {
  const { id = "default" } = useParams();
  const current = useCurrentPlanId();
  useLayoutEffect(() => {
    if (current !== id) setCurrentPlanId(id);
  }, [current, id]);
  const plan = usePlan();
  const nav = useNavigate();
  usePlanDraftVersion();
  if (current !== id) return null;
  const cart = plan.data;
  return (
    <MainFrame nav={false}>
      <div className="page p15 flow22">
        <div className="flow22__head">
          <button type="button" className="pd15__back" aria-label={m15.detail.back} onClick={() => nav(back)}>
            <ChevronLeft size={28} aria-hidden />
          </button>
          <h1>{title}</h1>
        </div>
        <Stepper step={step} />
        <LoadState q={plan} hasData={!!cart} />
        {cart && children(id, cart)}
      </div>
      {cart && bar && <div className="flow22__bar">{bar(id, cart)}</div>}
    </MainFrame>
  );
}

/* ---------- Bước 1: Thêm món ---------- */
export function PlanAdd() {
  const all = useItems({ tab: "active", horizon: 7 });
  const edit = usePlanItem();
  const nav = useNavigate();
  return (
    <Flow
      step={1}
      title={p22.addTitle}
      back="/plan"
      bar={(id, cart) => (
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          aria-disabled={cart.item_count === 0 || undefined}
          onClick={() => cart.item_count > 0 && nav(`/plan/${encodeURIComponent(id)}/compare`)}
        >
          {p22.toCompare(cart.item_count)}
        </button>
      )}
    >
      {(id, cart) => {
        const inCart = new Set(cart.items.map((i) => i.key));
        const rank = { now: 0, soon: 1, plenty: 2 } as const;
        const list = [...(all.data ?? [])].sort((a, b) => rank[goodsTier(a)] - rank[goodsTier(b)] || (a.days_left ?? 999) - (b.days_left ?? 999));
        // Món đã thêm mà không có trong Đồ dùng (món mới): vẫn hiện để bỏ được.
        const extra = cart.items.filter((i) => !list.some((x) => x.key === i.key));
        const toggle = (key: string, on: boolean) => {
          if (edit.isPending) return;
          edit.mutate({ key, add: !on, planId: id }, { onSuccess: () => markDraft(id) });
        };
        const row = (key: string, name: string, cat: string, sub: string) => {
          const on = inCart.has(key);
          return (
            <li key={key} className="line15">
              <div className="line15__row">
                <CategoryIcon category={cat} />
                <span className="line15__text">
                  <span className="line15__name">{name}</span>
                  <span className="line15__sub">{sub}</span>
                </span>
                <button
                  type="button"
                  className={on ? "tog22 tog22--on" : "tog22"}
                  aria-pressed={on}
                  aria-label={on ? m15.plan.removeLineOf(name) : `${p22.add} ${name}`}
                  aria-disabled={(edit.isPending && edit.variables?.key === key) || undefined}
                  onClick={() => toggle(key, on)}
                >
                  {on ? <Check size={20} aria-hidden /> : <Plus size={20} aria-hidden />}
                </button>
              </div>
            </li>
          );
        };
        return (
          <>
            <p className="hint">{p22.addHint}</p>
            <ul className="lines15">
              {extra.map((i) => row(i.key, i.name, i.category_key, `${i.qty} ${unitLabel(i.unit || savedUnit(i))}`))}
              {list.map((i) => row(i.key, i.name, i.category_key, i.days_left != null ? p22.daysLeft(i.days_left) : m15.plan.learning))}
            </ul>
            {edit.isError && <p className="error" role="alert">{errText(edit.error)}</p>}
            <AddAnything cart={cart} />
          </>
        );
      }}
    </Flow>
  );
}

/* ---------- Bước 2: So sánh giá ---------- */
export function PlanCompare() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"item" | "store">("item");
  const market = useMarketPrices(true);
  const { id: routeId = "default" } = useParams();
  const [picks, setPicks] = useState<Record<string, string>>(() => readPicks(routeId));
  const byKey = useMemo(() => new Map((market.data?.items ?? []).map((m) => [m.key, m.prices])), [market.data]);
  const totalOf = (cart: Cart) => cart.items.reduce((s, i) => s + (chosen(i, optionsOf(i, byKey.get(i.key) ?? []), picks)?.total ?? 0), 0);
  return (
    <Flow
      step={2}
      title={p22.compareTitle}
      back="/plan"
      bar={(id, cart) => (
        <div className="flow22__sum">
          <span>
            <small>{p22.total}</small>
            <b className="num">{formatVnd(totalOf(cart))}</b>
          </span>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => nav(`/plan/${encodeURIComponent(id)}/confirm`)}>{p22.next}</button>
        </div>
      )}
    >
      {(id, cart) => (
        <>
          <div className="seg seg15" role="group" aria-label={p22.compareTitle}>
            <button type="button" aria-pressed={mode === "item"} onClick={() => setMode("item")}>{p22.byItem}</button>
            <button type="button" aria-pressed={mode === "store"} onClick={() => setMode("store")}>{p22.byStore}</button>
          </div>
          {mode === "store" ? (
            <>
              <MarketPricesPanel cart={cart} />
              <BasketPricesPanel cart={cart} />
            </>
          ) : (
            <>
              <p className="hint">{p22.compareHint}</p>
              {cart.items.map((item) => {
                const opts = optionsOf(item, byKey.get(item.key) ?? []);
                const cur = chosen(item, opts, picks);
                return (
                  <section key={item.key} className="box15 cmpi22" aria-label={item.name}>
                    <h2>{item.name}</h2>
                    {opts.length === 0 ? (
                      <p className="hint">{p22.noPrice}</p>
                    ) : (
                      <ul role="radiogroup" aria-label={item.name} className="cmpi22__list">
                        {opts.map((o, i) => (
                          <li key={o.id} className={cur?.id === o.id ? "cmpi22__opt cmpi22__opt--on" : "cmpi22__opt"}>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={cur?.id === o.id}
                              className="cmpi22__pick"
                              onClick={() => {
                                const next = { ...picks, [item.key]: o.id };
                                setPicks(next);
                                writePicks(id, next);
                                markDraft(id);
                              }}
                            >
                              <span className="cmpi22__rad" aria-hidden />
                              <span className="cmpi22__text">
                                <b>
                                  {o.store}
                                  {i === 0 && opts.length > 1 && <span className="cmp22__tag">{p22.lowest}</span>}
                                </b>
                                <small>{o.sub}</small>
                              </span>
                              <span className="num cmpi22__price">{formatVnd(o.total)}</span>
                            </button>
                            {o.url && (
                              <a className="cmpi22__src" href={o.url} target="_blank" rel="noopener noreferrer" aria-label={m15.plan.compare + ": " + o.store}>
                                <ExternalLink size={16} aria-hidden />
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </>
      )}
    </Flow>
  );
}

/* ---------- Bước 3: Xác nhận và người mua ---------- */
export function PlanConfirm() {
  const nav = useNavigate();
  const me = useMe();
  const h = useHousehold();
  const { relationOf } = useRelations();
  const market = useMarketPrices(true);
  const plans = usePlans();
  const save = useSavePlanState();
  const { assign } = useAssignments();
  const delegated = useDelegated();
  const { id: routeId = "default" } = useParams();
  const sentTo = (delegated.data?.from_me ?? []).find((a) => a.plan_id === routeId && (a.status === "assigned" || a.status === "shopping"));
  const saved = buyerOf(routeId) ?? (sentTo ? sentTo.buyer_uid : null);
  const [pick, setPick] = useState<string | null>(saved === me.data?.uid ? "me" : saved);
  const picks = readPicks(routeId);
  const byKey = new Map((market.data?.items ?? []).map((m) => [m.key, m.prices]));
  const others = (h.data?.members ?? []).filter((m) => m.uid !== me.data?.uid);
  const memberName = (uid: string) => others.find((m) => m.uid === uid)?.display_name ?? sentTo?.buyer_display_name ?? "";
  const busy = save.isPending || assign.isPending;
  const meta = plans.data?.find((p) => p.id === routeId);

  const submit = (id: string, cart: Cart, total: number) => {
    if (busy || !pick) return;
    if (pick === "mimi") return nav(sentTo ? `/plan/${encodeURIComponent(id)}` : "/plan/online");
    setBuyer(id, pick);
    const st = cart.state;
    save.mutate(
      { buy_date: st.buy_date, buy_hour: st.buy_hour, buy_minute: st.buy_minute, trip_note: st.trip_note, base_rev: st.rev },
      {
        onSuccess: () => {
          const done = (who: string) => {
            clearDraft(id);
            nav(`/plan/${encodeURIComponent(id)}/done`, { replace: true, state: { who, count: cart.item_count, total, name: meta ? planName(meta) : "" } });
          };
          if (pick === "me") return done("");
          const keys = cart.items.map((i) => i.key);
          assign.mutate({ buyer_uid: pick, keys }, { onSuccess: () => done(memberName(pick)) });
        },
      },
    );
  };

  return (
    <Flow
      step={3}
      title={p22.confirmTitle}
      back="/plan"
      bar={(id, cart) => {
        const total = cart.items.reduce((s, i) => s + (chosen(i, optionsOf(i, byKey.get(i.key) ?? []), picks)?.total ?? 0), 0);
        const label = pick === "mimi" ? p22.goMimi : pick && pick !== "me" ? p22.sendTo(memberName(pick)) : p22.savePlan;
        return (
          <div className="flow22__sum">
            <span>
              <small>{p22.total}</small>
              <b className="num">{formatVnd(total)}</b>
            </span>
            <button type="button" className="btn btn--primary btn--lg" aria-disabled={!pick || busy || undefined} onClick={() => submit(id, cart, total)}>
              {busy ? t.confirm.saving : label}
            </button>
          </div>
        );
      }}
    >
      {(_id, cart) => (
        <>
          <h2 className="h15sec">{p22.willBuy}</h2>
          <ul className="box15 conf22">
            {cart.items.map((i) => {
              const o = chosen(i, optionsOf(i, byKey.get(i.key) ?? []), picks);
              return (
                <li key={i.key}>
                  <span>
                    <b>{i.name}</b>
                    <small>{o ? o.store : p22.noPrice}</small>
                  </span>
                  <span className="num">{o ? formatVnd(o.total) : "–"}</span>
                </li>
              );
            })}
          </ul>
          <h2 className="h15sec">{p22.whoBuys}</h2>
          <div className="box15 who22" role="radiogroup" aria-label={p22.whoBuys}>
            <WhoRow on={pick === "me"} Icon={UserRound} title={p22.me} sub={p22.meSub} onPick={() => setPick("me")} />
            {others.map((m) => {
              const rel = relationOf(m.uid);
              return (
                <WhoRow
                  key={m.uid}
                  on={pick === m.uid}
                  Icon={UserRound}
                  title={m.display_name || m15.plan.sendMember}
                  sub={p22.member(rel ? m15.settings.relations[rel as keyof typeof m15.settings.relations] : "")}
                  onPick={() => setPick(m.uid)}
                />
              );
            })}
            <WhoRow on={pick === "mimi"} Icon={Bot} title={p22.mimi} sub={p22.mimiSub} onPick={() => setPick("mimi")} />
          </div>
          {!pick && <p className="hint" role="status">{p22.pickBuyer}</p>}
          {(save.isError || assign.isError) && <p className="error" role="alert">{errText(save.error ?? assign.error)}</p>}
        </>
      )}
    </Flow>
  );
}

function WhoRow({ on, Icon, title, sub, onPick }: { on: boolean; Icon: typeof Store; title: string; sub: string; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={on ? "who22__row who22__row--on" : "who22__row"} onClick={onPick}>
      <span className="cmpi22__rad" aria-hidden />
      <Icon size={20} aria-hidden />
      <span className="who22__text">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </button>
  );
}

/* ---------- Màn kết quả (B7) ---------- */
export function PlanDone() {
  const { id = "default" } = useParams();
  const st = (useLocation().state ?? {}) as { who?: string; count?: number; total?: number; name?: string };
  return (
    <MainFrame nav={false}>
      <div className="page p15 done22">
        <span className="done22__icon" aria-hidden><CircleCheckBig size={44} /></span>
        <h1>{st.who ? p22.doneSent(st.who) : p22.doneSaved}</h1>
        {st.name && <p className="done22__name">{st.name}</p>}
        {st.count != null && <p className="hint">{p22.doneSub(st.count, formatVnd(st.total ?? 0))}</p>}
        <p className="hint">{p22.doneNote}</p>
        <div className="done22__btns">
          <Link to="/plan" className="btn btn--primary btn--block btn--lg">{p22.backPlans}</Link>
          <Link to={`/plan/${encodeURIComponent(id)}`} className="btn btn--outline btn--block btn--lg">{p22.openPlan}</Link>
        </div>
      </div>
    </MainFrame>
  );
}
