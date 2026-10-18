import { t } from "../i18n";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListFilter, Search, X } from "lucide-react";
import { useItems, useQuickStock, useUndoStock } from "../api/hooks";
import type { Item, ItemsQuery } from "../api/types";
import { MainFrame, TopBar, useUndo } from "../components/AppShell";
import { ItemRow } from "../components/ItemRow";
import { normalizeVi } from "../lib/text";

type Tier1 = "goods" | "recurring";
type Grouping = "category" | "product";
const HORIZONS = [3, 7, 14] as const;

/**
 * Màn mẫu của cả ứng dụng (spec mục 4): ít chữ, thoáng, ba tầng điều khiển từ cao xuống thấp.
 * Việc tiếp theo: đưa tầng 1, tầng 2 và chip ngày lên URL (useSearchParams) để bấm quay lại vẫn đúng tab.
 */
export function Items() {
  const [tier1, setTier1] = useState<Tier1>("goods");
  const [tab, setTab] = useState<ItemsQuery["tab"]>("soon");
  const [horizon, setHorizon] = useState<ItemsQuery["horizon"]>(7);
  const [grouping, setGrouping] = useState<Grouping>("category");
  const [showFilter, setShowFilter] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const tabsId = useId();
  const searchId = useId();

  const items = useItems({ tab, horizon });
  const quick = useQuickStock();
  const undoStock = useUndoStock();
  const showUndo = useUndo();

  const visible = useMemo(() => {
    const list = items.data ?? [];
    const q = normalizeVi(term);
    return q ? list.filter((i) => normalizeVi(i.name).includes(q)) : list;
  }, [items.data, term]);

  const groups = useMemo(() => {
    if (grouping === "product") return [{ label: tab === "soon" ? t.items.soon : t.items.active, items: visible }];
    const map = new Map<string, Item[]>();
    for (const i of visible) map.set(i.category_label, [...(map.get(i.category_label) ?? []), i]);
    return [...map].map(([label, items]) => ({ label, items }));
  }, [visible, grouping, tab]);

  function act(item: Item, kind: "plenty" | "out") {
    quick.mutate(
      { item, quick: kind },
      {
        onSuccess: ({ result }) =>
          showUndo({
            message:
              (kind === "plenty" ? t.items.markedPlenty(item.name) : t.items.markedOut(item.name)) +
              (result === "queued" ? t.items.willSync : "."),
            onUndo: () => undoStock.mutate(item),
          }),
      },
    );
  }

  return (
    <MainFrame>
      <TopBar title={t.items.title} />
      <div className="page" style={{ paddingTop: 0 }}>
        {/* Tầng 1 */}
        <div className="seg" role="group" aria-label={t.items.typeGroup}>
          <button type="button" aria-pressed={tier1 === "goods"} onClick={() => setTier1("goods")}>{t.items.goods}</button>
          <button type="button" aria-pressed={tier1 === "recurring"} onClick={() => setTier1("recurring")}>{t.items.recurring}</button>
        </div>

        {tier1 === "recurring" ? (
          <div className="empty">
            <h2>{t.items.recurringTitle}</h2>
            <p>{t.items.recurringBody}</p>
            <Link className="btn btn--quiet" to="/spending">{t.items.openSpending}</Link>
          </div>
        ) : (
          <>
            {/* Tầng 2 */}
            <div className="tabs">
              <div role="tablist" aria-label={t.items.statusGroup} id={tabsId} style={{ display: "contents" }}>
                <button role="tab" className="tab" aria-selected={tab === "soon"} onClick={() => setTab("soon")}>{t.items.soon}</button>
                <button role="tab" className="tab" aria-selected={tab === "active"} onClick={() => setTab("active")}>{t.items.active}</button>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={t.items.search}
                aria-expanded={searchOpen}
                aria-controls={searchId}
                onClick={() => {
                  setSearchOpen((v) => !v);
                  if (searchOpen) setTerm("");
                }}
              >
                {searchOpen ? <X size={22} aria-hidden /> : <Search size={22} aria-hidden />}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t.items.grouping}
                aria-expanded={showFilter}
                onClick={() => setShowFilter((v) => !v)}
              >
                <ListFilter size={22} aria-hidden />
              </button>
            </div>

            {searchOpen && (
              <div className="search" id={searchId}>
                <label htmlFor={`${searchId}-q`} className="visually-hidden">{t.items.search}</label>
                <input
                  id={`${searchId}-q`}
                  className="input"
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t.items.searchPlaceholder}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {/* Tầng 3 và khoảng ngày */}
            {(tab === "soon" || showFilter) && (
              <div className="chips">
                {tab === "soon" && (
                  <>
                    <span className="chips__label">{t.items.within}</span>
                    {HORIZONS.map((h) => (
                      <button key={h} type="button" className="chip" aria-pressed={horizon === h} onClick={() => setHorizon(h)}>
                        {t.items.daysChip(h)}
                      </button>
                    ))}
                  </>
                )}
                {showFilter && (
                  <>
                    <button type="button" className="chip" aria-pressed={grouping === "category"} onClick={() => setGrouping("category")}>{t.items.byCategory}</button>
                    <button type="button" className="chip" aria-pressed={grouping === "product"} onClick={() => setGrouping("product")}>{t.items.byProduct}</button>
                  </>
                )}
              </div>
            )}

            {items.isPending ? (
              <div aria-busy="true" aria-label={t.common.loading}>
                {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton" />)}
              </div>
            ) : items.isError && !items.data ? (
              <div className="empty">
                <h2>{t.items.loadFailedTitle}</h2>
                <p>{t.items.loadFailedBody}</p>
                <button className="btn btn--quiet" onClick={() => items.refetch()}>{t.common.retry}</button>
              </div>
            ) : visible.length === 0 ? (
              term ? (
                <div className="empty"><h2>{t.items.noMatch(term)}</h2></div>
              ) : tab === "soon" ? (
                <div className="empty">
                  <h2>{t.items.noneSoonTitle(horizon)}</h2>
                  <p>{t.items.noneSoonBody}</p>
                </div>
              ) : (
                <div className="empty">
                  <h2>{t.items.emptyTitle}</h2>
                  <p>{t.items.emptyBody}</p>
                  <Link className="btn btn--primary" to="/scan">{t.home.scan}</Link>
                </div>
              )
            ) : (
              groups.map((g) => (
                <section key={g.label} className="group" aria-label={g.label}>
                  <h2>{g.label}</h2>
                  <ul className="list">
                    {g.items.map((item) => (
                      <ItemRow key={item.key} item={item}>
                        {tab === "soon" && (
                          <div className="quick">
                            <button type="button" className="btn btn--quiet" onClick={() => act(item, "plenty")}>{t.items.stillHave}</button>
                            <button type="button" className="btn btn--quiet" onClick={() => act(item, "out")}>{t.items.ranOut}</button>
                          </div>
                        )}
                      </ItemRow>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </MainFrame>
  );
}
