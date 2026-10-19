import { t } from "../i18n";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ApiError } from "../api/client";
import { useItems, usePlan, usePlanItem, usePlanPrices, useSavePlanState } from "../api/hooks";
import type { CartItem, Item, PlanPrices, PlanState } from "../api/types";
import { MainFrame, TopBar } from "../components/AppShell";
import { CategoryIcon, STATUS_TEXT } from "../components/ItemRow";
import { formatVnd } from "../lib/text";

/** Dòng phụ dưới tên món: tồn hiện tại, cùng cách nói với màn Đồ dùng. */
function stockText(i: Pick<Item, "status" | "days_left">): string {
  if (i.status === "out" || i.status === "buy_now") return t.row.buyNow;
  if (i.status === "waiting" || i.days_left === null) return t.row.waiting;
  return `${i.days_left} ${t.row.days(i.days_left, STATUS_TEXT[i.status])}`;
}

/**
 * Kế hoạch mua sắm (spec mục 5), bốn phần từ trên xuống:
 * Sắp hết (thêm vào giỏ) → Giỏ (giá, dự kiến chi) → Nơi mua tối ưu → Thời gian mua.
 * Mọi con số do API tính; màn này chỉ hiển thị.
 */
export function Plan() {
  const plan = usePlan();
  const needs = useItems({ tab: "soon", horizon: 7 });
  const cart = plan.data;
  const prices = usePlanPrices((cart?.item_count ?? 0) > 0);
  const edit = usePlanItem();
  const busyKey = edit.isPending ? edit.variables?.key : undefined;

  if (plan.error instanceof ApiError && plan.error.status === 403) {
    return (
      <MainFrame>
        <TopBar title={t.plan.title} />
        <div className="page empty"><p>{t.plan.ownerOnly}</p></div>
      </MainFrame>
    );
  }

  const inCart = new Set(cart?.items.map((i) => i.key));
  const suggestions = (needs.data ?? []).filter((i) => !inCart.has(i.key));
  const names = new Map(cart?.items.map((i) => [i.key, i.name]));

  return (
    <MainFrame>
      <TopBar title={t.plan.title} />
      <div className="page plan">
        {plan.isError && !cart && (
          <div className="empty">
            <h2>{t.plan.loadFailed}</h2>
            <button className="btn btn--quiet" onClick={() => plan.refetch()}>{t.common.retry}</button>
          </div>
        )}
        {plan.isPending && <p className="hint">{t.common.loading}</p>}

        {/* 1. Sắp hết: món chưa có trong giỏ */}
        <section className="plan-sec" aria-labelledby="plan-needs">
          <h2 id="plan-needs">{t.plan.needsTitle}</h2>
          {needs.data && suggestions.length === 0 && <p className="hint">{t.plan.needsEmpty}</p>}
          <ul className="list">
            {suggestions.map((i) => (
              <li key={i.key} className="plan-row">
                <CategoryIcon category={i.category_key} />
                <span className="plan-row__text">
                  <span className="plan-row__name">{i.name}</span>
                  <span className="plan-row__sub">{stockText(i)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn--quiet"
                  aria-label={t.plan.addLabel(i.name)}
                  aria-disabled={busyKey === i.key || undefined}
                  onClick={() => busyKey !== i.key && edit.mutate({ key: i.key, add: true })}
                >
                  <Plus size={18} aria-hidden /> {t.plan.add}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 2. Giỏ */}
        {cart && (
          <section className="plan-sec" aria-labelledby="plan-cart">
            <h2 id="plan-cart">{t.plan.cartTitle(cart.item_count)}</h2>
            {cart.item_count === 0 && <p className="hint">{t.plan.cartEmpty}</p>}
            <ul className="list">
              {cart.items.map((i) => (
                <CartRow key={i.key} item={i} busy={busyKey === i.key} onRemove={() => edit.mutate({ key: i.key, add: false })} />
              ))}
            </ul>
            {cart.item_count > 0 && (
              <>
                <p className="plan-total">
                  <span>{t.plan.estimate}</span>
                  <span className="num">{cart.estimate != null ? formatVnd(cart.estimate) : "–"}</span>
                </p>
                {cart.missing_price > 0 && <p className="hint">{t.plan.missing(cart.missing_price)}</p>}
              </>
            )}
          </section>
        )}

        {/* 3. Nơi mua tối ưu */}
        {cart && cart.item_count > 0 && prices.data && <WhereToBuy prices={prices.data} names={names} />}

        {/* 4. Thời gian mua. Form dựng một lần khi có dữ liệu; sau đó trạng thái nằm trong form. */}
        {cart && <TripForm initial={cart.state} />}

        <p className="hint plan-tip">{t.plan.tip}</p>
      </div>
    </MainFrame>
  );
}

function CartRow({ item, busy, onRemove }: { item: CartItem; busy: boolean; onRemove: () => void }) {
  return (
    <li className="plan-row">
      <CategoryIcon category={item.category_key} />
      <span className="plan-row__text">
        <span className="plan-row__name">{item.name}</span>
        <span className="plan-row__sub">
          {stockText(item)} ·{" "}
          {item.unit_price != null && item.best_store
            ? t.plan.priceAt(formatVnd(item.unit_price), item.best_store)
            : t.plan.noPrice}
        </span>
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.plan.remove(item.name)}
        aria-disabled={busy || undefined}
        onClick={() => !busy && onRemove()}
      >
        <X size={20} aria-hidden />
      </button>
    </li>
  );
}

function WhereToBuy({ prices, names }: { prices: PlanPrices; names: Map<string, string> }) {
  const label = (keys: string[]) => keys.map((k) => names.get(k) ?? k).join(", ");
  const nothingPriced = prices.split.length === 0;
  return (
    <section className="plan-sec" aria-labelledby="plan-where">
      <h2 id="plan-where">{t.plan.whereTitle}</h2>
      {nothingPriced ? (
        <p className="hint">{t.plan.whereNone}</p>
      ) : prices.recommend === "single" && prices.single_store ? (
        <div className="plan-stop">
          <div className="plan-stop__head">
            <span>{t.plan.oneStore(prices.single_store.store)}</span>
            <span className="num">{formatVnd(prices.single_store.total)}</span>
          </div>
          <div className="plan-stop__items">{label(prices.single_store.groups)}</div>
        </div>
      ) : (
        <>
          <p className="plan-row__sub" style={{ marginBottom: "var(--s2)" }}>{t.plan.split}</p>
          {prices.split.map((s) => (
            <div key={s.store} className="plan-stop">
              <div className="plan-stop__head">
                <span>{s.store}</span>
                <span className="num">{formatVnd(s.total)}</span>
              </div>
              <div className="plan-stop__items">{label(s.groups)}</div>
            </div>
          ))}
          {prices.single_store && prices.saving > 0 && <p className="hint">{t.plan.saving(formatVnd(prices.saving))}</p>}
        </>
      )}
      {prices.single_source.length > 0 && <p className="hint">{t.plan.singleSource(label(prices.single_source))}</p>}
    </section>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function TripForm({ initial }: { initial: PlanState }) {
  const [st, setSt] = useState<PlanState>(initial);
  const [saved, setSaved] = useState<PlanState>(initial); // bản đã lưu gần nhất, để biết có thay đổi chưa
  const save = useSavePlanState();
  const dirty = JSON.stringify(st) !== JSON.stringify(saved);
  return (
    <section className="plan-sec" aria-labelledby="plan-when">
      <h2 id="plan-when">{t.plan.whenTitle}</h2>
      <form
        className="plan-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (save.isPending || !dirty) return;
          save.mutate({ ...st, trip_note: st.trip_note.trim() }, {
            onSuccess: (s) => {
              setSt(s);
              setSaved(s);
            },
          });
        }}
      >
        <div className="plan-form__row">
          <label>
            {t.plan.date}
            <input type="date" value={st.buy_date} onChange={(e) => setSt({ ...st, buy_date: e.target.value })} />
          </label>
          <label>
            {t.plan.hour}
            <select
              value={st.buy_hour ?? ""}
              onChange={(e) => setSt({ ...st, buy_hour: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">{t.plan.anyTime}</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t.plan.note}
          <textarea
            maxLength={120}
            placeholder={t.plan.notePlaceholder}
            value={st.trip_note}
            onChange={(e) => setSt({ ...st, trip_note: e.target.value })}
          />
        </label>
        {save.isError && <p className="error" role="alert">{t.common.genericError}</p>}
        <button type="submit" className="btn btn--primary btn--block" aria-disabled={save.isPending || !dirty || undefined}>
          {save.isSuccess && !dirty ? t.plan.saved : t.plan.save}
        </button>
      </form>
    </section>
  );
}
