import { useState } from "react";
import { Banknote, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { ApiError } from "../api/client";
import { useAssignments } from "../api/hooks";
import type { Assignment } from "../api/types";
import { t, uiLang } from "../i18n";
import { m15 } from "../i18n/m15";
import { formatVnd } from "../lib/text";

const S = m15.settle;
const rateFmt = new Intl.NumberFormat(uiLang === "en" ? "en-US" : "vi-VN");

/** Vòng mua hộ có khoản cần trả lại (đã quét hóa đơn, phần món của mẹ lớn hơn 0). */
export const owes = (a: Assignment) => (a.settlement?.owed_vnd ?? 0) > 0;
/** Còn việc cho mẹ: chưa trả, đang chờ Venmo, hoặc lần trước lỗi. */
export const settleOpen = (a: Assignment) => owes(a) && a.settlement!.status !== "paid";

/**
 * Thẻ "Trả lại Minh X" phía người nhờ (Venmo qua PayPal Payouts, hoặc tiền mặt). Số tiền hiện
 * theo tiền tệ mẹ chọn (VND hoặc USD) theo tỷ giá ngày mua; Venmo luôn chi bằng USD.
 */
export function SettleCard({ a, payoutsEnabled }: { a: Assignment; payoutsEnabled: boolean }) {
  const { settle, refreshSettle } = useAssignments();
  const [askCash, setAskCash] = useState(false);
  const st = a.settlement;
  if (!st || st.owed_vnd <= 0) return null;
  const name = a.buyer_display_name || m15.events.someone;
  const amount = formatVnd(st.owed_vnd, a.closed_at);
  const busy = settle.isPending || refreshSettle.isPending;
  const err = settle.error ?? refreshSettle.error;
  const noWallet = err instanceof ApiError && err.fields?.field === "payout_wallet";

  if (st.status === "paid") {
    return (
      <div className="box15 settle15 settle15--done" role="status">
        <p className="settle15__line"><CheckCircle2 size={20} aria-hidden />
          {st.method === "venmo" ? S.paidVenmo(amount, st.receiver ?? "") : S.paidCash(amount)}
        </p>
        {st.method === "venmo" && st.amount_usd && <small className="hint">US${st.amount_usd}</small>}
      </div>
    );
  }

  const pending = st.status === "pending";
  return (
    <section className="box15 settle15" aria-label={S.title(name)}>
      <h2>{S.title(name)}</h2>
      <p className="settle15__amount num">{S.owed(amount)}</p>
      {pending ? (
        <>
          <p className="hint">{st.error === "UNCLAIMED" ? S.unclaimed(name) : S.pending(st.amount_usd ?? "", st.receiver ?? "")}</p>
          <button type="button" className="btn btn--outline btn--block" aria-disabled={busy || undefined}
            onClick={() => !busy && refreshSettle.mutate(a.assignment_id)}>
            <RefreshCw size={18} aria-hidden /> {S.check}
          </button>
        </>
      ) : (
        <>
          {st.status === "failed" && <p className="error" role="alert">{S.failed}</p>}
          {payoutsEnabled && st.amount_usd && st.vnd_per_usd && st.status === "failed" && (
            <p className="hint">{S.usd(st.amount_usd, rateFmt.format(st.vnd_per_usd))}</p>
          )}
          {payoutsEnabled && (
            <button type="button" className="btn btn--primary btn--block btn--lg" aria-disabled={busy || undefined}
              onClick={() => !busy && settle.mutate({ id: a.assignment_id, method: "venmo" })}>
              <Send size={18} aria-hidden /> {st.status === "failed" ? S.retry : S.venmo}
            </button>
          )}
          {askCash ? (
            <div className="settle15__confirm">
              <p>{S.confirmCash(amount, name)}</p>
              <div className="settle15__row">
                <button type="button" className="btn btn--quiet" onClick={() => setAskCash(false)}>{S.no}</button>
                <button type="button" className="btn btn--primary" aria-disabled={busy || undefined}
                  onClick={() => !busy && settle.mutate({ id: a.assignment_id, method: "cash" }, { onSettled: () => setAskCash(false) })}>
                  {S.yes}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn--outline btn--block" aria-disabled={busy || undefined} onClick={() => setAskCash(true)}>
              <Banknote size={18} aria-hidden /> {S.cash}
            </button>
          )}
          <p className="hint">{S.usOnly}</p>
        </>
      )}
      {err && <p className="error" role="alert">{noWallet ? S.noWallet(name) : err instanceof ApiError ? err.message : t.common.genericError}</p>}
    </section>
  );
}
