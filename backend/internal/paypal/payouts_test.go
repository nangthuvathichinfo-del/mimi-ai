package paypal

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPayoutFlow(t *testing.T) {
	var got map[string]any
	var reqID string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v1/oauth2/token":
			_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":3600}`))
		case r.URL.Path == "/v1/payments/payouts" && r.Method == http.MethodPost:
			reqID = r.Header.Get("PayPal-Request-Id")
			_ = json.NewDecoder(r.Body).Decode(&got)
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"batch_header":{"payout_batch_id":"B1","batch_status":"PENDING"}}`))
		case r.URL.Path == "/v1/payments/payouts/B1" && r.Method == http.MethodGet:
			if r.ContentLength > 0 || r.Header.Get("PayPal-Request-Id") != "" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			_, _ = w.Write([]byte(`{"batch_header":{"payout_batch_id":"B1","batch_status":"SUCCESS"},"items":[{"payout_item_id":"I1","transaction_status":"SUCCESS"}]}`))
		case r.URL.Path == "/v1/payments/payouts/B2":
			_, _ = w.Write([]byte(`{"batch_header":{"payout_batch_id":"B2","batch_status":"SUCCESS"},"items":[{"payout_item_id":"I2","transaction_status":"FAILED","errors":{"name":"RECEIVER_UNREGISTERED"}}]}`))
		case r.URL.Path == "/v1/payments/payouts/DUP":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"name":"USER_BUSINESS_ERROR","details":[{"issue":"DUPLICATE_REQUEST_ID"}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	c, err := New(srv.URL, "id", "secret")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	p, err := c.CreatePayout(ctx, PayoutRequest{BatchID: "mimi-a1-1", Wallet: WalletVenmo, Receiver: "4085551234", AmountUSD: "5.20", Note: "Mimi reimbursement"})
	if err != nil || p.BatchID != "B1" || p.BatchStatus != "PENDING" {
		t.Fatalf("create = %+v, %v", p, err)
	}
	if reqID != "payout-mimi-a1-1" {
		t.Errorf("PayPal-Request-Id = %q", reqID)
	}
	hdr := got["sender_batch_header"].(map[string]any)
	item := got["items"].([]any)[0].(map[string]any)
	if hdr["sender_batch_id"] != "mimi-a1-1" || hdr["recipient_type"] != "PHONE" {
		t.Errorf("header = %v", hdr)
	}
	if item["recipient_wallet"] != "VENMO" || item["receiver"] != "4085551234" || item["note"] != "Mimi reimbursement" {
		t.Errorf("item = %v", item)
	}
	if amt := item["amount"].(map[string]any); amt["value"] != "5.20" || amt["currency"] != "USD" {
		t.Errorf("amount = %v", amt)
	}

	p, err = c.GetPayout(ctx, "B1")
	if err != nil || p.ItemStatus != PayoutSuccess || p.ItemID != "I1" {
		t.Fatalf("get = %+v, %v", p, err)
	}
	p, err = c.GetPayout(ctx, "B2")
	if err != nil || p.ItemStatus != PayoutFailed || p.Error != "RECEIVER_UNREGISTERED" {
		t.Fatalf("get failed item = %+v, %v", p, err)
	}
	if _, err := c.GetPayout(ctx, "DUP"); !errors.Is(err, ErrDeclined) {
		t.Fatalf("400 should be declined, got %v", err)
	}
}

func TestRecipientType(t *testing.T) {
	if recipientType("minh@example.com") != "EMAIL" || recipientType("4085551234") != "PHONE" {
		t.Fatal("recipient type")
	}
}

func TestFakePayout(t *testing.T) {
	f := NewFake()
	ctx := context.Background()
	p, err := f.CreatePayout(ctx, PayoutRequest{BatchID: "b", Wallet: WalletVenmo, Receiver: "4085551234", AmountUSD: "1.00"})
	if err != nil {
		t.Fatal(err)
	}
	again, _ := f.CreatePayout(ctx, PayoutRequest{BatchID: "b", Wallet: WalletVenmo, Receiver: "4085551234", AmountUSD: "1.00"})
	if again.BatchID != p.BatchID {
		t.Error("same batch id should give same payout")
	}
	g, err := f.GetPayout(ctx, p.BatchID)
	if err != nil || g.ItemStatus != PayoutSuccess {
		t.Fatalf("get = %+v, %v", g, err)
	}
	if _, err := f.CreatePayout(ctx, PayoutRequest{BatchID: "b", Receiver: "fail@example.com", AmountUSD: "1.00"}); !errors.Is(err, ErrDeclined) {
		t.Fatal("receiver with fail should be declined")
	}
}
