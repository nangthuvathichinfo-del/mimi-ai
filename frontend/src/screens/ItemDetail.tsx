import { t } from "../i18n";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { qk, useQuickStock, useUndoStock } from "../api/hooks";
import type { Item } from "../api/types";
import { TopBar, useUndo, MainFrame } from "../components/AppShell";
import { CategoryIcon, STATUS_TEXT, statusTone } from "../components/ItemRow";
import { formatDayMonth } from "../lib/text";

const CONFIDENCE = t.detail.confidenceLevels;

/** Chi tiết món (spec mục 4). Bản khung: số ngày, độ tin cậy, nguồn, ba nút chỉnh nhanh. */
export function ItemDetail() {
  const { key = "" } = useParams();
  const q = useQuery({ queryKey: qk.item(key), queryFn: () => apiGet<Item>(`/items/${key}`) });
  const quick = useQuickStock();
  const undo = useUndoStock();
  const showUndo = useUndo();
  const item = q.data;

  return (
    <MainFrame>
      <TopBar title={item?.name ?? t.detail.fallbackTitle} variant="sub" />
      <div className="page detail">
        {item && (
          <>
            <div className="detail__figure">
              <CategoryIcon category={item.category_key} />
              <span className={`tone-${statusTone(item)}`}>
                <span className="row__big num">{item.days_left ?? "–"}</span>{" "}
                <span className="row__unit">{item.days_left === null ? t.detail.waiting : t.detail.daysLeft(STATUS_TEXT[item.status])}</span>
              </span>
            </div>
            <dl className="facts">
              <dt>{t.detail.expected}</dt>
              <dd>{item.predicted_out_on ? formatDayMonth(item.predicted_out_on) : t.detail.notEnough}</dd>
              <dt>{t.detail.confidence}</dt>
              <dd>{item.confidence ? CONFIDENCE[item.confidence] : t.detail.none} ({t.detail.purchases(item.purchase_count)})</dd>
              <dt>{t.detail.source}</dt>
              <dd>{item.source === "manual" ? t.detail.manual : t.detail.predicted}</dd>
              <dt>{t.detail.category}</dt>
              <dd>{item.category_label}</dd>
            </dl>
            <div className="stock-btns" role="group" aria-label={t.detail.stockGroup}>
              {(
                [
                  ["plenty", t.detail.plenty],
                  ["soon", t.detail.soon],
                  ["out", t.detail.out],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className="btn btn--quiet"
                  onClick={() =>
                    quick.mutate(
                      { item, quick: k },
                      {
                        onSuccess: () => {
                          q.refetch();
                          showUndo({ message: t.detail.marked(label), onUndo: () => undo.mutate(item, { onSuccess: () => q.refetch() }) });
                        },
                      },
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hint">{t.detail.hint}</p>
          </>
        )}
      </div>
    </MainFrame>
  );
}
