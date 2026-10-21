package service

import (
	"errors"
	"net"
	"net/textproto"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestAdminMailFailureResult(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{"smtp response", &common.SMTPDeliveryError{Stage: "recipient", Err: &textproto.Error{Code: 550, Msg: "private recipient"}}, "smtp_recipient_550"},
		{"dns", &common.SMTPDeliveryError{Stage: "connect", Err: &net.DNSError{Err: "lookup failed"}}, "smtp_connect_dns"},
		{"other", &common.SMTPDeliveryError{Stage: "auth", Err: errors.New("private detail")}, "smtp_auth"},
		{"unknown", errors.New("private detail"), "smtp_failed"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := adminMailFailureResult(test.err); got != test.want {
				t.Fatalf("got %q, want %q", got, test.want)
			}
		})
	}
}
