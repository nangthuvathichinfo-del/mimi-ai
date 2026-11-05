package paypal

import (
	"context"
	"net/http"
	"net/url"
	"strings"
)

// Payouts (PayPal Payouts API v1): Mimi chuyển tiền tới ví Venmo hoặc PayPal của người đi
// mua hộ, để mẹ trả lại tiền đã mua giúp. Dùng chung app PayPal (Client ID, Secret) với
// Checkout; app phải được bật tính năng Payouts. Venmo chỉ nhận người nhận ở Mỹ, tiền USD.

// Ví nhận tiền.
const (
	WalletVenmo  = "VENMO"
	WalletPayPal = "PAYPAL"
)

// Trạng thái một khoản chi theo PayPal (transaction_status của payout item).
const (
	PayoutSuccess   = "SUCCESS"
	PayoutPending   = "PENDING"
	PayoutUnclaimed = "UNCLAIMED" // người nhận chưa có tài khoản; PayPal giữ 30 ngày rồi trả lại
	PayoutOnHold    = "ONHOLD"
	PayoutFailed    = "FAILED"
)

// PayoutRequest là một lần chi cho một người nhận (một batch, một item).
type PayoutRequest struct {
	// BatchID là sender_batch_id: PayPal từ chối batch trùng mã trong 30 ngày, nên gọi lại
	// cùng mã không chi hai lần.
	BatchID   string
	Wallet    string // WalletVenmo | WalletPayPal
	Receiver  string // Venmo: số điện thoại Mỹ 10 số hoặc email; PayPal: email
	AmountUSD string // "12.34"
	Note      string // ASCII, Venmo bắt buộc có ghi chú
}

// Payout là trạng thái batch và item sau khi tạo hoặc khi kiểm tra lại.
type Payout struct {
	BatchID     string // payout_batch_id do PayPal cấp
	BatchStatus string // PENDING | PROCESSING | SUCCESS | DENIED...
	ItemID      string
	ItemStatus  string // PayoutSuccess, PayoutPending...; rỗng khi PayPal chưa tạo item
	Error       string // tên lỗi PayPal ghi cho item (RECEIVER_UNREGISTERED...)
}

// recipientType: Venmo nhận số điện thoại hoặc email; PayPal ở đây chỉ nhận email.
func recipientType(receiver string) string {
	if strings.Contains(receiver, "@") {
		return "EMAIL"
	}
	return "PHONE"
}

// CreatePayout tạo một batch Payouts một người nhận. PayPal xử lý bất đồng bộ: kết quả
// thường là PENDING, gọi GetPayout để biết đã tới ví chưa.
func (c *Client) CreatePayout(ctx context.Context, r PayoutRequest) (Payout, error) {
	body := map[string]any{
		"sender_batch_header": map[string]any{
			"sender_batch_id": r.BatchID,
			"email_subject":   "You have a payment from Mimi",
			"email_message":   truncate(r.Note, 1000),
			"recipient_type":  recipientType(r.Receiver),
		},
		"items": []map[string]any{{
			"amount":           map[string]any{"value": r.AmountUSD, "currency": Currency},
			"receiver":         r.Receiver,
			"recipient_wallet": r.Wallet,
			"note":             truncate(r.Note, 4000),
			"sender_item_id":   r.BatchID,
		}},
	}
	var out struct {
		BatchHeader struct {
			PayoutBatchID string `json:"payout_batch_id"`
			BatchStatus   string `json:"batch_status"`
		} `json:"batch_header"`
	}
	if err := c.do(ctx, http.MethodPost, "/v1/payments/payouts", "payout-"+r.BatchID, body, &out); err != nil {
		return Payout{}, err
	}
	return Payout{BatchID: out.BatchHeader.PayoutBatchID, BatchStatus: out.BatchHeader.BatchStatus}, nil
}

// GetPayout đọc trạng thái batch và item đầu tiên (Mimi chỉ tạo batch một item).
func (c *Client) GetPayout(ctx context.Context, batchID string) (Payout, error) {
	var out struct {
		BatchHeader struct {
			PayoutBatchID string `json:"payout_batch_id"`
			BatchStatus   string `json:"batch_status"`
		} `json:"batch_header"`
		Items []struct {
			PayoutItemID      string `json:"payout_item_id"`
			TransactionStatus string `json:"transaction_status"`
			Errors            struct {
				Name string `json:"name"`
			} `json:"errors"`
		} `json:"items"`
	}
	if err := c.get(ctx, "/v1/payments/payouts/"+url.PathEscape(batchID), &out); err != nil {
		return Payout{}, err
	}
	p := Payout{BatchID: out.BatchHeader.PayoutBatchID, BatchStatus: out.BatchHeader.BatchStatus}
	if len(out.Items) > 0 {
		it := out.Items[0]
		p.ItemID, p.ItemStatus, p.Error = it.PayoutItemID, it.TransactionStatus, it.Errors.Name
	}
	return p, nil
}

// ---------- Fake ----------

// CreatePayout giả lập: tiền tới ví ngay. Người nhận chứa "fail" thì bị từ chối, để thử
// đường lỗi trong demo.
func (Fake) CreatePayout(_ context.Context, r PayoutRequest) (Payout, error) {
	if r.Receiver == "" || r.AmountUSD == "" {
		return Payout{}, ErrDeclined
	}
	if strings.Contains(strings.ToLower(r.Receiver), "fail") {
		return Payout{}, ErrDeclined
	}
	return Payout{BatchID: "FAKEPAYOUT-" + short(r.BatchID), BatchStatus: "SUCCESS"}, nil
}

func (Fake) GetPayout(_ context.Context, batchID string) (Payout, error) {
	if !strings.HasPrefix(batchID, "FAKEPAYOUT-") {
		return Payout{}, ErrDeclined
	}
	return Payout{BatchID: batchID, BatchStatus: "SUCCESS", ItemID: "FAKEITEM-" + short(batchID), ItemStatus: PayoutSuccess}, nil
}
