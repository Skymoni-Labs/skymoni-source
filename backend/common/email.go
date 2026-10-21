package common

import (
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/smtp"
	"net/textproto"
	"slices"
	"strings"
	"time"
)

func generateMessageID() (string, error) {
	split := strings.Split(SMTPFrom, "@")
	if len(split) < 2 {
		return "", fmt.Errorf("invalid SMTP account")
	}
	domain := strings.Split(SMTPFrom, "@")[1]
	return fmt.Sprintf("<%d.%s@%s>", time.Now().UnixNano(), GetRandomString(12), domain), nil
}

func shouldUseSMTPLoginAuth() bool {
	if SMTPForceAuthLogin {
		return true
	}
	return isOutlookServer(SMTPAccount) || slices.Contains(EmailLoginAuthServerList, SMTPServer)
}

func getSMTPAuth() smtp.Auth {
	return AutoSMTPAuth(SMTPAccount, SMTPToken)
}

func shouldAuthenticateSMTP() bool {
	return SMTPAccount != "" && SMTPToken != ""
}

func smtpTLSConfig() *tls.Config {
	return &tls.Config{
		ServerName:         SMTPServer,
		InsecureSkipVerify: SMTPInsecureSkipVerify, // #nosec G402 -- admin-controlled SMTP compatibility option.
	}
}

func newSMTPClient(addr string) (*smtp.Client, error) {
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	if SMTPSSLEnabled || (SMTPPort == 465 && !SMTPStartTLSEnabled) {
		conn, err := tls.DialWithDialer(dialer, "tcp", addr, smtpTLSConfig())
		if err != nil {
			return nil, err
		}
		_ = conn.SetDeadline(time.Now().Add(60 * time.Second))
		client, err := smtp.NewClient(conn, SMTPServer)
		if err != nil {
			_ = conn.Close()
			return nil, err
		}
		return client, nil
	}

	conn, err := dialer.Dial("tcp", addr)
	if err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Now().Add(60 * time.Second))
	client, err := smtp.NewClient(conn, SMTPServer)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}

	if SMTPStartTLSEnabled {
		startTLSSupported, _ := client.Extension("STARTTLS")
		if !startTLSSupported {
			_ = client.Close()
			return nil, fmt.Errorf("SMTP server does not support STARTTLS")
		}
		if err := client.StartTLS(smtpTLSConfig()); err != nil {
			_ = client.Close()
			return nil, err
		}
	}

	return client, nil
}

// A lost DATA acknowledgement may mean the server already accepted the mail.
// Callers must not silently retry an uncertain delivery.
type EmailDeliveryUncertain struct{ Err error }

func (e *EmailDeliveryUncertain) Error() string { return e.Err.Error() }
func (e *EmailDeliveryUncertain) Unwrap() error { return e.Err }

// SMTPDeliveryError identifies the protocol stage without storing a provider
// response, which may contain recipient addresses or other sensitive data.
type SMTPDeliveryError struct {
	Stage string
	Err   error
}

func (e *SMTPDeliveryError) Error() string { return e.Stage + ": " + e.Err.Error() }
func (e *SMTPDeliveryError) Unwrap() error { return e.Err }

func SendEmail(subject string, receiver string, content string) error {
	if SMTPFrom == "" { // for compatibility
		SMTPFrom = SMTPAccount
	}
	id, err2 := generateMessageID()
	if err2 != nil {
		return err2
	}
	if SMTPServer == "" && SMTPAccount == "" {
		return fmt.Errorf("SMTP 服务器未配置")
	}
	bodyHeaders, encodedBody, err := buildEmailMIMEBody(content)
	if err != nil {
		return err
	}
	encodedSubject := fmt.Sprintf("=?UTF-8?B?%s?=", base64.StdEncoding.EncodeToString([]byte(subject)))
	mail := []byte(fmt.Sprintf("To: %s\r\n"+
		"From: %s <%s>\r\n"+
		"Subject: %s\r\n"+
		"Date: %s\r\n"+
		"Message-ID: %s\r\n"+ // 添加 Message-ID 头
		"MIME-Version: 1.0\r\n"+
		"%s\r\n%s\r\n",
		receiver, SystemName, SMTPFrom, encodedSubject, time.Now().Format(time.RFC1123Z), id, bodyHeaders, encodedBody))
	auth := getSMTPAuth()
	addr := fmt.Sprintf("%s:%d", SMTPServer, SMTPPort)
	to := strings.Split(receiver, ";")
	client, err := newSMTPClient(addr)
	if err != nil {
		return &SMTPDeliveryError{Stage: "connect", Err: err}
	}
	defer client.Close()
	if shouldAuthenticateSMTP() {
		if err = client.Auth(auth); err != nil {
			return &SMTPDeliveryError{Stage: "auth", Err: err}
		}
	}
	if err = client.Mail(SMTPFrom); err != nil {
		return &SMTPDeliveryError{Stage: "sender", Err: err}
	}
	for _, receiver := range to {
		if err = client.Rcpt(receiver); err != nil {
			return &SMTPDeliveryError{Stage: "recipient", Err: err}
		}
	}
	w, err := client.Data()
	if err != nil {
		return &SMTPDeliveryError{Stage: "data", Err: err}
	}
	_, err = w.Write(mail)
	if err != nil {
		return &EmailDeliveryUncertain{Err: &SMTPDeliveryError{Stage: "data", Err: err}}
	}
	err = w.Close()
	if err != nil {
		var rejected *textproto.Error
		if errors.As(err, &rejected) {
			return &SMTPDeliveryError{Stage: "data", Err: err}
		}
		return &EmailDeliveryUncertain{Err: &SMTPDeliveryError{Stage: "data", Err: err}}
	}
	err = client.Quit()
	if err != nil {
		SysError(fmt.Sprintf("failed to send email to %s: %v", receiver, err))
	}
	// DATA was accepted. Failure to close the session does not undo delivery.
	return nil
}
