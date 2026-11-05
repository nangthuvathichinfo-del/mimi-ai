package household

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/smartlife-lab/mimi/backend/internal/apperr"
	"github.com/smartlife-lab/mimi/backend/internal/authz"
	"github.com/smartlife-lab/mimi/backend/internal/domain"
	"github.com/smartlife-lab/mimi/backend/internal/paypal"
)

// ---------- Trả lại tiền mua hộ (Venmo qua PayPal Payouts) ----------
//
// Vòng mua hộ kết thúc bằng hóa đơn thì người nhờ nợ người đi mua đúng phần món của mình (B4,
// splitSpend). Phần đó ghi vào settlement.owed_vnd lúc lưu hóa đơn. Người nhờ trả lại bằng:
//   - Venmo: Mimi chi qua PayPal Payouts tới ví Venmo của người đi mua (tài khoản Mỹ, tiền USD,
//     tỷ giá khóa lúc trả). Payouts xử lý chậm nên có bước "Kiểm tra lại".
//   - Tiền mặt: chỉ đánh dấu đã trả, không có tiền đi qua Mimi.
//
// Trạng thái: unpaid → pending → paid | failed; failed trả lại được. Gửi lại cùng lần trả
// không chi hai lần: sender_batch_id suy từ mã vòng và số lần thử; lần trước lỗi mạng (không
// rõ PayPal đã nhận chưa) thì lần sau dùng lại đúng mã đó.

// Trạng thái quyết toán.
const (
	SettleUnpaid  = "unpaid"
	SettlePending = "pending"
	SettlePaid    = "paid"
	SettleFailed  = "failed"
)

// errUnavailable: lỗi ghi vào settlement.error khi không rõ PayPal đã nhận lệnh chi hay chưa.
const errUnavailable = "unavailable"

// Settlement là khối shopping_assignments/{id}.settlement.
type Settlement struct {
	OwedVND int64  `json:"owed_vnd"`
	Status  string `json:"status"`           // unpaid | pending | paid | failed
	Method  string `json:"method,omitempty"` // venmo | cash
	// Số USD và tỷ giá khóa lúc bấm trả (Venmo chỉ nhận USD).
	AmountUSD  string `json:"amount_usd,omitempty"`
	VNDPerUSD  int64  `json:"vnd_per_usd,omitempty"`
	RateSource string `json:"rate_source,omitempty"`
	RateAsOf   string `json:"rate_as_of,omitempty"`
	// Receiver: ví nhận đã che bớt (•••1234), để người nhờ biết tiền đi đâu mà không lộ số.
	Receiver      string     `json:"receiver,omitempty"`
	SenderBatchID string     `json:"sender_batch_id,omitempty"`
	PayoutBatchID string     `json:"payout_batch_id,omitempty"`
	Attempt       int        `json:"attempt,omitempty"`
	Error         string     `json:"error,omitempty"` // mã lỗi PayPal của lần gần nhất
	PaidAt        *time.Time `json:"paid_at,omitempty"`
	UpdatedAt     *time.Time `json:"updated_at,omitempty"`
}

// Payouts là phần PayPal Payouts mà quyết toán cần (paypal.Client, paypal.Fake).
type Payouts interface {
	CreatePayout(ctx context.Context, r paypal.PayoutRequest) (paypal.Payout, error)
	GetPayout(ctx context.Context, batchID string) (paypal.Payout, error)
}

// Wallet là ví nhận tiền người đi mua lưu ở Hồ sơ. Receiver rỗng: chưa lưu.
type Wallet struct {
	Kind     string // venmo | paypal
	Receiver string
}

// Wallets đọc ví nhận tiền của một người (users/{uid}.settings.payout_wallet).
type Wallets interface {
	PayoutWallet(ctx context.Context, uid string) (Wallet, error)
}

// Rate là tỷ giá dùng khi trả (cùng tỷ giá với đơn mua online).
type Rate struct {
	VNDPerUSD int64
	Source    string
	AsOf      string
}

// WithPayouts bật trả lại tiền qua Venmo.
func (s *Service) WithPayouts(p Payouts, w Wallets, r Rate) *Service {
	s.payouts, s.wallets, s.rate = p, w, r
	return s
}

// PayoutsEnabled: app chỉ hiện nút Venmo khi máy chủ đã bật Payouts.
func (s *Service) PayoutsEnabled() bool { return s.payouts != nil }

// SettleRequest là thân POST /households/shopping-assignments/{id}/settle.
type SettleRequest struct {
	Method string `json:"method"` // venmo | cash
}

func (s *Service) ownerAssignment(ctx context.Context, p authz.Principal, id string) (Assignment, error) {
	if err := authz.Can(p, authz.ActionAssignShopping); err != nil {
		return Assignment{}, err
	}
	if p.HouseholdID == "" {
		return Assignment{}, apperr.ErrForbidden
	}
	a, err := s.store.Assignment(ctx, p.HouseholdID, id)
	if err != nil {
		return Assignment{}, err
	}
	if a.OwnerUID != p.UID {
		return Assignment{}, apperr.ErrForbidden
	}
	if a.Settlement == nil || a.Settlement.OwedVND <= 0 {
		return Assignment{}, apperr.New(apperr.CodeInvalidState, "Lần mua hộ này không có khoản cần trả lại.").With("status", a.Status)
	}
	return a, nil
}

// Settle: người nhờ trả lại tiền cho người đi mua, bằng Venmo hoặc đánh dấu đã trả tiền mặt.
// Đã trả rồi, hoặc đang chờ Venmo, thì trả về vòng hiện tại (bấm hai lần không chi hai lần).
func (s *Service) Settle(ctx context.Context, p authz.Principal, id string, req SettleRequest) (Assignment, error) {
	if req.Method != "venmo" && req.Method != "cash" {
		return Assignment{}, bad("method", "Cách trả chỉ là venmo hoặc cash.")
	}
	a, err := s.ownerAssignment(ctx, p, id)
	if err != nil {
		return Assignment{}, err
	}
	cur := *a.Settlement
	if cur.Status == SettlePaid || cur.Status == SettlePending {
		return a, nil
	}
	now := s.now()
	retryable := []string{SettleUnpaid, SettleFailed, ""}
	if req.Method == "cash" {
		next := cur
		next.Status, next.Method, next.Error = SettlePaid, "cash", ""
		next.PaidAt, next.UpdatedAt = &now, &now
		return s.store.SetSettlement(ctx, p.HouseholdID, id, retryable, next)
	}

	if s.payouts == nil {
		return Assignment{}, apperr.New(apperr.CodePaymentNotEnabled, "Chưa bật trả lại tiền qua Venmo.")
	}
	w, err := s.wallets.PayoutWallet(ctx, a.BuyerUID)
	if err != nil {
		return Assignment{}, err
	}
	if w.Receiver == "" {
		name := a.BuyerName
		if name == "" {
			name = "Người đi mua"
		}
		return Assignment{}, apperr.New(apperr.CodeValidation, name+" chưa lưu số Venmo ở Hồ sơ.").With("field", "payout_wallet")
	}
	rate := s.rate.VNDPerUSD
	if rate <= 0 {
		return Assignment{}, apperr.New(apperr.CodePaymentNotEnabled, "Chưa có tỷ giá để quy đổi sang USD.")
	}
	usd := toUSD(cur.OwedVND, rate)
	if usd == "0.00" {
		return Assignment{}, apperr.New(apperr.CodeValidation, "Số tiền quá nhỏ để trả qua Venmo.").With("field", "amount")
	}

	// Lần trước lỗi mạng: chưa biết PayPal đã nhận chưa, nên dùng lại đúng mã lô cũ.
	attempt := cur.Attempt + 1
	if cur.Status == SettleFailed && cur.Error == errUnavailable && cur.Attempt > 0 {
		attempt = cur.Attempt
	}
	next := cur
	next.Status, next.Method, next.Error = SettlePending, "venmo", ""
	next.AmountUSD, next.VNDPerUSD, next.RateSource, next.RateAsOf = usd, rate, s.rate.Source, s.rate.AsOf
	if next.RateAsOf == "" {
		next.RateAsOf = domain.Today(now, domain.Location(p.Timezone)).String()
	}
	next.Receiver, next.Attempt, next.PayoutBatchID = maskReceiver(w.Receiver), attempt, ""
	next.SenderBatchID = senderBatchID(id, attempt)
	next.UpdatedAt = &now
	// Giữ chỗ trước khi gọi PayPal: hai lần bấm cùng lúc thì lần sau gặp pending và dừng.
	if _, err := s.store.SetSettlement(ctx, p.HouseholdID, id, retryable, next); err != nil {
		return Assignment{}, err
	}

	wallet := paypal.WalletVenmo
	if w.Kind == "paypal" {
		wallet = paypal.WalletPayPal
	}
	note := "Mimi reimbursement"
	if trip, err := s.plans.PlanTrip(ctx, a.OwnerUID, a.PlanID); err == nil && trip.PlanName != "" {
		note += " - " + trip.PlanName
	}
	po, perr := s.payouts.CreatePayout(ctx, paypal.PayoutRequest{
		BatchID: next.SenderBatchID, Wallet: wallet, Receiver: w.Receiver, AmountUSD: usd,
		Note: domain.ASCII(note, 120),
	})
	done := s.now()
	next.UpdatedAt = &done
	if perr != nil {
		next.Status, next.Error = SettleFailed, errUnavailable
		if errors.Is(perr, paypal.ErrDeclined) {
			next.Error = "declined"
		}
		if _, err := s.store.SetSettlement(ctx, p.HouseholdID, id, []string{SettlePending}, next); err != nil {
			return Assignment{}, err
		}
		return Assignment{}, payoutErr(perr)
	}
	next.PayoutBatchID = po.BatchID
	next.Status, next.Error = batchStatus(po.BatchStatus)
	if next.Status == SettlePaid {
		next.PaidAt = &done
	}
	return s.store.SetSettlement(ctx, p.HouseholdID, id, []string{SettlePending}, next)
}

// stuckAfter: giữ chỗ pending mà chưa có mã lô quá lâu là lần gọi PayPal đã đứt giữa chừng.
const stuckAfter = 2 * time.Minute

// RefreshSettlement hỏi PayPal xem khoản Venmo đang chờ đã tới ví chưa (nút "Kiểm tra lại").
func (s *Service) RefreshSettlement(ctx context.Context, p authz.Principal, id string) (Assignment, error) {
	a, err := s.ownerAssignment(ctx, p, id)
	if err != nil {
		return Assignment{}, err
	}
	cur := *a.Settlement
	if cur.Status != SettlePending || cur.Method != "venmo" {
		return a, nil
	}
	if s.payouts == nil {
		return Assignment{}, apperr.New(apperr.CodePaymentNotEnabled, "Chưa bật trả lại tiền qua Venmo.")
	}
	now := s.now()
	next := cur
	next.UpdatedAt = &now
	if cur.PayoutBatchID == "" {
		if cur.UpdatedAt != nil && now.Sub(*cur.UpdatedAt) < stuckAfter {
			return a, nil
		}
		// Lần gọi trước đứt giữa chừng: cho trả lại, dùng lại đúng mã lô cũ.
		next.Status, next.Error = SettleFailed, errUnavailable
		return s.store.SetSettlement(ctx, p.HouseholdID, id, []string{SettlePending}, next)
	}
	po, err := s.payouts.GetPayout(ctx, cur.PayoutBatchID)
	if err != nil {
		return Assignment{}, payoutErr(err)
	}
	next.Status, next.Error = itemStatus(po)
	if next.Status == SettlePaid {
		next.PaidAt = &now
	}
	if next.Status == cur.Status && next.Error == cur.Error {
		return a, nil
	}
	return s.store.SetSettlement(ctx, p.HouseholdID, id, []string{SettlePending}, next)
}

// batchStatus: trạng thái batch ngay sau khi tạo. Fake trả SUCCESS; PayPal thật thường PENDING.
func batchStatus(st string) (string, string) {
	switch st {
	case "SUCCESS":
		return SettlePaid, ""
	case "DENIED", "CANCELED":
		return SettleFailed, st
	}
	return SettlePending, ""
}

// itemStatus: trạng thái khoản chi (payout item) khi kiểm tra lại.
func itemStatus(po paypal.Payout) (string, string) {
	errName := func(def string) string {
		if po.Error != "" {
			return po.Error
		}
		return def
	}
	switch po.ItemStatus {
	case paypal.PayoutSuccess:
		return SettlePaid, ""
	case paypal.PayoutFailed, "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED":
		return SettleFailed, errName(po.ItemStatus)
	case paypal.PayoutUnclaimed:
		// Số Venmo chưa có tài khoản: PayPal giữ tiền, người đi mua cần đăng ký Venmo để nhận.
		return SettlePending, paypal.PayoutUnclaimed
	case "":
		if po.BatchStatus == "DENIED" || po.BatchStatus == "CANCELED" {
			return SettleFailed, po.BatchStatus
		}
	}
	return SettlePending, ""
}

func payoutErr(err error) error {
	if errors.Is(err, paypal.ErrDeclined) {
		return apperr.Wrap(apperr.CodePaymentFailed, "PayPal từ chối lệnh trả qua Venmo. Kiểm tra số Venmo rồi thử lại.", err)
	}
	return apperr.Wrap(apperr.CodePaymentUnavailable, "PayPal đang bận, thử lại sau ít phút.", err)
}

// senderBatchID: mã lô Payouts của một lần trả, tối đa 127 ký tự theo PayPal.
func senderBatchID(assignmentID string, attempt int) string {
	id := assignmentID
	if len(id) > 100 {
		id = id[:100]
	}
	return fmt.Sprintf("mimi-%s-%d", id, attempt)
}

// toUSD quy đồng sang USD 2 chữ số thập phân, làm tròn nửa lên (như order.ToUSD).
func toUSD(vnd, vndPerUSD int64) string {
	cents := (vnd*100 + vndPerUSD/2) / vndPerUSD
	return fmt.Sprintf("%d.%02d", cents/100, cents%100)
}

// maskReceiver che ví nhận: số điện thoại còn 4 số cuối, email còn chữ đầu và tên miền.
func maskReceiver(r string) string {
	if at := strings.IndexByte(r, '@'); at > 0 {
		return r[:1] + "•••" + r[at:]
	}
	if len(r) > 4 {
		return "•••" + r[len(r)-4:]
	}
	return "•••"
}
