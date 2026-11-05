package user

import (
	"testing"
	"time"
)

func TestNormalizeWallet(t *testing.T) {
	cases := []struct {
		in   PayoutWallet
		want string
		ok   bool
	}{
		{PayoutWallet{"venmo", "(408) 555-1234"}, "4085551234", true},
		{PayoutWallet{"venmo", "+1 408 555 1234"}, "4085551234", true},
		{PayoutWallet{"venmo", "Minh@Example.com"}, "minh@example.com", true},
		{PayoutWallet{"paypal", "minh@example.com"}, "minh@example.com", true},
		{PayoutWallet{"venmo", ""}, "", true},
		{PayoutWallet{"venmo", "0912345678"}, "", false}, // số Việt Nam
		{PayoutWallet{"venmo", "+84 912 345 678"}, "", false},
		{PayoutWallet{"paypal", "4085551234"}, "", false},
		{PayoutWallet{"zalo", "minh@example.com"}, "", false},
		{PayoutWallet{"venmo", "@minh"}, "", false},
	}
	for _, c := range cases {
		got, ok := NormalizeWallet(c.in)
		if ok != c.ok || got.Receiver != c.want {
			t.Errorf("NormalizeWallet(%+v) = %+v, %v; want %q, %v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestPayoutWalletPatch(t *testing.T) {
	p := SettingsPatch{PayoutWallet: &PayoutWallet{Kind: "venmo", Receiver: "408-555-1234"}}
	if err := p.Validate(); err != nil {
		t.Fatal(err)
	}
	next := p.Apply(Stored{Settings: map[string]any{"lang": "vi"}}, time.Now())
	w, _ := next.Settings["payout_wallet"].(map[string]any)
	if w["kind"] != "venmo" || w["receiver"] != "4085551234" || next.Settings["lang"] != "vi" {
		t.Fatalf("settings = %v", next.Settings)
	}
	clear := SettingsPatch{PayoutWallet: &PayoutWallet{Kind: "venmo"}}
	if _, ok := clear.Apply(next, time.Now()).Settings["payout_wallet"]; ok {
		t.Fatal("empty receiver should remove the wallet")
	}
	bad := SettingsPatch{PayoutWallet: &PayoutWallet{Kind: "venmo", Receiver: "0912345678"}}
	if bad.Validate() == nil {
		t.Fatal("Vietnamese number should be rejected")
	}
}
