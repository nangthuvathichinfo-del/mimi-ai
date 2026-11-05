package household

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/smartlife-lab/mimi/backend/internal/apperr"
	"github.com/smartlife-lab/mimi/backend/internal/authz"
	"github.com/smartlife-lab/mimi/backend/internal/paypal"
)

type settleStore struct {
	Store
	a Assignment
}

func (m *settleStore) Assignment(context.Context, string, string) (Assignment, error) {
	return m.a, nil
}
func (m *settleStore) SetSettlement(_ context.Context, _, _ string, from []string, st Settlement) (Assignment, error) {
	cur := ""
	if m.a.Settlement != nil {
		cur = m.a.Settlement.Status
	}
	if m.a.Settlement == nil || !slices.Contains(from, cur) {
		return Assignment{}, apperr.New(apperr.CodeInvalidState, "changed")
	}
	st.OwedVND = m.a.Settlement.OwedVND
	m.a.Settlement = &st
	return m.a, nil
}

type wallets map[string]Wallet

func (w wallets) PayoutWallet(_ context.Context, uid string) (Wallet, error) { return w[uid], nil }

// payoutsSpy ghi lại lệnh chi; status là batch_status trả về khi tạo.
type payoutsSpy struct {
	reqs   []paypal.PayoutRequest
	status string
	err    error
	item   paypal.Payout
}

func (p *payoutsSpy) CreatePayout(_ context.Context, r paypal.PayoutRequest) (paypal.Payout, error) {
	p.reqs = append(p.reqs, r)
	if p.err != nil {
		return paypal.Payout{}, p.err
	}
	return paypal.Payout{BatchID: "B-" + r.BatchID, BatchStatus: p.status}, nil
}

func (p *payoutsSpy) GetPayout(context.Context, string) (paypal.Payout, error) { return p.item, nil }

var lan = authz.Principal{UID: "lan", Role: authz.RoleOwner, HouseholdID: "h1", Timezone: "Asia/Ho_Chi_Minh"}

func settleSetup(owed int64) (*Service, *settleStore, *payoutsSpy) {
	st := &settleStore{a: Assignment{ID: "trip-ab12", OwnerUID: "lan", BuyerUID: "minh", BuyerName: "Minh", PlanID: "p1", Status: "completed",
		Settlement: &Settlement{OwedVND: owed, Status: SettleUnpaid}}}
	spy := &payoutsSpy{status: "PENDING"}
	now := time.Date(2026, 11, 5, 9, 0, 0, 0, time.UTC)
	s := New(st, runPlans{}, func() time.Time { return now }).
		WithPayouts(spy, wallets{"minh": {Kind: "venmo", Receiver: "4085551234"}}, Rate{VNDPerUSD: 25_000, Source: "cau-hinh", AsOf: "2026-11-05"})
	return s, st, spy
}

func TestSettleVenmoPendingThenRefresh(t *testing.T) {
	s, st, spy := settleSetup(130_000)
	a, err := s.Settle(context.Background(), lan, "trip-ab12", SettleRequest{Method: "venmo"})
	if err != nil {
		t.Fatal(err)
	}
	got := a.Settlement
	if got.Status != SettlePending || got.Method != "venmo" || got.AmountUSD != "5.20" || got.VNDPerUSD != 25_000 || got.RateAsOf != "2026-11-05" {
		t.Fatalf("settlement = %+v", got)
	}
	if got.Receiver != "•••1234" || got.PayoutBatchID != "B-mimi-trip-ab12-1" || got.Attempt != 1 {
		t.Fatalf("settlement = %+v", got)
	}
	r := spy.reqs[0]
	if r.Wallet != paypal.WalletVenmo || r.Receiver != "4085551234" || r.AmountUSD != "5.20" || r.BatchID != "mimi-trip-ab12-1" {
		t.Fatalf("payout request = %+v", r)
	}
	if r.Note != "Mimi reimbursement" {
		t.Errorf("note = %q", r.Note)
	}

	// Bấm lại khi đang chờ: không chi lần hai.
	if _, err := s.Settle(context.Background(), lan, "trip-ab12", SettleRequest{Method: "venmo"}); err != nil || len(spy.reqs) != 1 {
		t.Fatalf("second settle: err %v, payouts %d", err, len(spy.reqs))
	}

	spy.item = paypal.Payout{ItemStatus: paypal.PayoutUnclaimed}
	a, _ = s.RefreshSettlement(context.Background(), lan, "trip-ab12")
	if a.Settlement.Status != SettlePending || a.Settlement.Error != paypal.PayoutUnclaimed {
		t.Fatalf("unclaimed = %+v", a.Settlement)
	}
	spy.item = paypal.Payout{ItemStatus: paypal.PayoutSuccess}
	a, _ = s.RefreshSettlement(context.Background(), lan, "trip-ab12")
	if a.Settlement.Status != SettlePaid || a.Settlement.PaidAt == nil || a.Settlement.Error != "" {
		t.Fatalf("after refresh = %+v", a.Settlement)
	}
	if st.a.Settlement.OwedVND != 130_000 {
		t.Fatal("owed amount must not change")
	}
}

func TestSettleFakePaysAtOnce(t *testing.T) {
	s, _, spy := settleSetup(50_000)
	spy.status = "SUCCESS"
	a, err := s.Settle(context.Background(), lan, "trip-ab12", SettleRequest{Method: "venmo"})
	if err != nil || a.Settlement.Status != SettlePaid || a.Settlement.PaidAt == nil {
		t.Fatalf("settle = %+v, %v", a.Settlement, err)
	}
}

func TestSettleCash(t *testing.T) {
	s, _, spy := settleSetup(50_000)
	a, err := s.Settle(context.Background(), lan, "trip-ab12", SettleRequest{Method: "cash"})
	if err != nil || a.Settlement.Status != SettlePaid || a.Settlement.Method != "cash" || len(spy.reqs) != 0 {
		t.Fatalf("cash = %+v, %v (payouts %d)", a.Settlement, err, len(spy.reqs))
	}
}

func TestSettleRetryReusesBatchAfterNetworkError(t *testing.T) {
	s, _, spy := settleSetup(50_000)
	spy.err = paypal.ErrUnavailable
	_, err := s.Settle(context.Background(), lan, "trip-ab12", SettleRequest{Method: "venmo"})
	if apperr.From(err).Code != apperr.CodePaymentUnavailable {
		t.Fatalf("err = %v", err)
	}
	spy.err = nil
	a, err := s.Settle(context.Background(), lan, "trip-ab12", SettleRequest{Method: "venmo"})
	if err != nil {
		t.Fatal(err)
	}
	if spy.reqs[0].BatchID != spy.reqs[1].BatchID || a.Settlement.Attempt != 1 {
		t.Fatalf("network retry must reuse batch id: %q vs %q", spy.reqs[0].BatchID, spy.reqs[1].BatchID)
	}
}

func TestSettleRetryNewBatchAfterDecline(t *testing.T) {
	s, st, spy := settleSetup(50_000)
	spy.err = paypal.ErrDeclined
	_, err := s.Settle(context.Background(), lan, "trip-ab12", SettleRequest{Method: "venmo"})
	if apperr.From(err).Code != apperr.CodePaymentFailed || st.a.Settlement.Status != SettleFailed {
		t.Fatalf("err = %v, settlement %+v", err, st.a.Settlement)
	}
	spy.err = nil
	if _, err := s.Settle(context.Background(), lan, "trip-ab12", SettleRequest{Method: "venmo"}); err != nil {
		t.Fatal(err)
	}
	if spy.reqs[1].BatchID != "mimi-trip-ab12-2" {
		t.Fatalf("decline retry should use a new batch id, got %q", spy.reqs[1].BatchID)
	}
}

func TestSettleGuards(t *testing.T) {
	ctx := context.Background()
	s, st, _ := settleSetup(50_000)
	minhP := authz.Principal{UID: "minh", Role: authz.RoleMember, HouseholdID: "h1"}
	if _, err := s.Settle(ctx, minhP, "trip-ab12", SettleRequest{Method: "cash"}); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("buyer settling own run: %v", err)
	}
	if _, err := s.Settle(ctx, lan, "trip-ab12", SettleRequest{Method: "zelle"}); apperr.From(err).Code != apperr.CodeValidation {
		t.Errorf("bad method: %v", err)
	}
	s2 := New(st, runPlans{}, nil).WithPayouts(&payoutsSpy{}, wallets{}, Rate{VNDPerUSD: 25_000})
	if _, err := s2.Settle(ctx, lan, "trip-ab12", SettleRequest{Method: "venmo"}); apperr.From(err).Code != apperr.CodeValidation {
		t.Errorf("no wallet: %v", err)
	}
	s3 := New(st, runPlans{}, nil)
	if _, err := s3.Settle(ctx, lan, "trip-ab12", SettleRequest{Method: "venmo"}); apperr.From(err).Code != apperr.CodePaymentNotEnabled {
		t.Errorf("payouts off: %v", err)
	}
	st.a.Settlement = nil
	if _, err := s.Settle(ctx, lan, "trip-ab12", SettleRequest{Method: "cash"}); apperr.From(err).Code != apperr.CodeInvalidState {
		t.Errorf("nothing owed: %v", err)
	}
}

func TestRefreshUnsticksPendingWithoutBatch(t *testing.T) {
	s, st, _ := settleSetup(50_000)
	old := time.Date(2026, 11, 5, 8, 0, 0, 0, time.UTC)
	st.a.Settlement = &Settlement{OwedVND: 50_000, Status: SettlePending, Method: "venmo", Attempt: 1, UpdatedAt: &old}
	a, err := s.RefreshSettlement(context.Background(), lan, "trip-ab12")
	if err != nil || a.Settlement.Status != SettleFailed || a.Settlement.Error != errUnavailable {
		t.Fatalf("refresh = %+v, %v", a.Settlement, err)
	}
}

func TestMaskReceiver(t *testing.T) {
	if maskReceiver("4085551234") != "•••1234" || maskReceiver("minh@example.com") != "m•••@example.com" {
		t.Fatal(maskReceiver("minh@example.com"))
	}
}
