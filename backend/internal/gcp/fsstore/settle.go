package fsstore

import (
	"context"
	"fmt"
	"slices"
	"time"

	"cloud.google.com/go/firestore"

	"github.com/smartlife-lab/mimi/backend/internal/apperr"
	"github.com/smartlife-lab/mimi/backend/internal/household"
)

var _ household.Wallets = (*Store)(nil)

// Quyết toán mua hộ: shopping_assignments/{id}.settlement {owed_vnd, status, method, amount_usd,
// vnd_per_usd, rate_source, rate_as_of, receiver (đã che), sender_batch_id, payout_batch_id,
// attempt, error, paid_at, updated_at}. Lưu hóa đơn của vòng ghi owed_vnd và status unpaid.

func settlementDoc(st household.Settlement) map[string]any {
	d := map[string]any{"owed_vnd": st.OwedVND, "status": st.Status}
	put := func(k, v string) {
		if v != "" {
			d[k] = v
		}
	}
	put("method", st.Method)
	put("amount_usd", st.AmountUSD)
	put("rate_source", st.RateSource)
	put("rate_as_of", st.RateAsOf)
	put("receiver", st.Receiver)
	put("sender_batch_id", st.SenderBatchID)
	put("payout_batch_id", st.PayoutBatchID)
	put("error", st.Error)
	if st.VNDPerUSD > 0 {
		d["vnd_per_usd"] = st.VNDPerUSD
	}
	if st.Attempt > 0 {
		d["attempt"] = int64(st.Attempt)
	}
	if st.PaidAt != nil {
		d["paid_at"] = *st.PaidAt
	}
	if st.UpdatedAt != nil {
		d["updated_at"] = *st.UpdatedAt
	}
	return d
}

func decodeSettlement(v any) *household.Settlement {
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	st := &household.Settlement{OwedVND: asInt64(m["owed_vnd"]), VNDPerUSD: asInt64(m["vnd_per_usd"]), Attempt: int(asInt64(m["attempt"]))}
	st.Status, _ = m["status"].(string)
	st.Method, _ = m["method"].(string)
	st.AmountUSD, _ = m["amount_usd"].(string)
	st.RateSource, _ = m["rate_source"].(string)
	st.RateAsOf, _ = m["rate_as_of"].(string)
	st.Receiver, _ = m["receiver"].(string)
	st.SenderBatchID, _ = m["sender_batch_id"].(string)
	st.PayoutBatchID, _ = m["payout_batch_id"].(string)
	st.Error, _ = m["error"].(string)
	if t, ok := m["paid_at"].(time.Time); ok {
		st.PaidAt = &t
	}
	if t, ok := m["updated_at"].(time.Time); ok {
		st.UpdatedAt = &t
	}
	return st
}

func (s *Store) SetSettlement(ctx context.Context, hid, id string, from []string, st household.Settlement) (household.Assignment, error) {
	if hid == "" || id == "" || len(id) > 80 {
		return household.Assignment{}, apperr.ErrNotFound
	}
	ref := s.household(hid).Collection("shopping_assignments").Doc(id)
	var out household.Assignment
	err := s.c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if isNotFound(err) {
			return apperr.ErrNotFound
		}
		if err != nil {
			return err
		}
		a := decodeAssignment(snap)
		cur := ""
		if a.Settlement != nil {
			cur = a.Settlement.Status
		}
		if a.Settlement == nil || !slices.Contains(from, cur) {
			return apperr.New(apperr.CodeInvalidState, "Khoản trả lại này vừa đổi trạng thái, tải lại để xem.").With("status", cur)
		}
		st.OwedVND = a.Settlement.OwedVND // số nợ chỉ hóa đơn quyết định
		if err := tx.Update(ref, []firestore.Update{{Path: "settlement", Value: settlementDoc(st)}}); err != nil {
			return err
		}
		a.Settlement = &st
		out = a
		return nil
	})
	if err != nil {
		return household.Assignment{}, fmt.Errorf("set settlement: %w", err)
	}
	return out, nil
}

// PayoutWallet đọc ví nhận tiền người đó lưu ở Hồ sơ (users/{uid}.settings.payout_wallet).
func (s *Store) PayoutWallet(ctx context.Context, uid string) (household.Wallet, error) {
	snap, err := s.user(uid).Get(ctx)
	if isNotFound(err) {
		return household.Wallet{}, nil
	}
	if err != nil {
		return household.Wallet{}, fmt.Errorf("payout wallet: %w", err)
	}
	settings, _ := snap.Data()["settings"].(map[string]any)
	w, _ := settings["payout_wallet"].(map[string]any)
	out := household.Wallet{}
	out.Kind, _ = w["kind"].(string)
	out.Receiver, _ = w["receiver"].(string)
	return out, nil
}
