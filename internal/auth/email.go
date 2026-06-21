package auth

import (
	"crypto/tls"
	"fmt"
	"log"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
	"unicode/utf8"

	finclawconfig "github.com/finclaw/internal/config"
)

const (
	smtpTimeout       = 12 * time.Second
	defaultSenderName = "Finclaw"
)

type Mailer struct {
	cfg *finclawconfig.SMTPSettings
}

func NewMailer(cfg *finclawconfig.SMTPSettings) *Mailer {
	return &Mailer{cfg: cfg}
}

func (m *Mailer) Enabled() bool {
	return m != nil && m.cfg != nil && m.cfg.Enabled()
}

func (m *Mailer) SendVerificationCode(to, code, purpose string) error {
	subject, body := verificationEmailContent(code, purpose)
	if !m.Enabled() {
		return ErrVerificationNotConfigured
	}
	return m.send(to, subject, body)
}

func (m *Mailer) send(to, subject, body string) error {
	fromHeader, envelopeFrom := m.buildFrom()
	msg := strings.Join([]string{
		fmt.Sprintf("Date: %s", time.Now().Format(time.RFC1123Z)),
		fmt.Sprintf("From: %s", fromHeader),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", encodeMIMEHeader(subject)),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		body,
	}, "\r\n")

	addr := fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port)
	auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)

	var err error
	if m.cfg.Port == 465 {
		err = sendMailImplicitTLS(addr, m.cfg.Host, auth, envelopeFrom, []string{to}, []byte(msg))
	} else {
		err = sendMailSTARTTLS(addr, m.cfg.Host, auth, envelopeFrom, []string{to}, []byte(msg))
	}
	if err != nil {
		log.Printf("[auth] SMTP send failed (host=%s port=%d): %v", m.cfg.Host, m.cfg.Port, err)
		return fmt.Errorf("%w: %v", ErrSMTPSendFailed, err)
	}
	return nil
}

func (m *Mailer) buildFrom() (headerValue, envelope string) {
	raw := strings.TrimSpace(m.cfg.From)
	if raw == "" {
		raw = fmt.Sprintf("%s <%s>", defaultSenderName, strings.TrimSpace(m.cfg.Username))
	}

	addr, err := mail.ParseAddress(raw)
	if err != nil {
		email := strings.TrimSpace(m.cfg.Username)
		return formatAddressHeader(defaultSenderName, email), email
	}

	name := strings.TrimSpace(addr.Name)
	if name == "" {
		name = defaultSenderName
	}
	return formatAddressHeader(name, addr.Address), addr.Address
}

func formatAddressHeader(name, email string) string {
	email = strings.TrimSpace(email)
	if email == "" {
		return encodeMIMEHeader(name)
	}
	if name == "" {
		return email
	}
	return fmt.Sprintf("%s <%s>", encodeMIMEHeader(name), email)
}

func encodeMIMEHeader(value string) string {
	if value == "" || isASCII(value) {
		return value
	}
	return mime.QEncoding.Encode("utf-8", value)
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

func sendMailImplicitTLS(addr, host string, auth smtp.Auth, from string, to []string, msg []byte) error {
	tlsConfig := &tls.Config{ServerName: host}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: smtpTimeout}, "tcp", addr, tlsConfig)
	if err != nil {
		return err
	}
	return sendMailClient(conn, host, auth, from, to, msg)
}

func sendMailSTARTTLS(addr, host string, auth smtp.Auth, from string, to []string, msg []byte) error {
	conn, err := net.DialTimeout("tcp", addr, smtpTimeout)
	if err != nil {
		return err
	}
	return sendMailClient(conn, host, auth, from, to, msg)
}

func sendMailClient(conn net.Conn, host string, auth smtp.Auth, from string, to []string, msg []byte) error {
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(smtpTimeout))

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if _, ok := conn.(*tls.Conn); !ok {
			tlsConfig := &tls.Config{ServerName: host}
			if err := client.StartTLS(tlsConfig); err != nil {
				return err
			}
		}
	}

	if auth != nil {
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(auth); err != nil {
				return err
			}
		}
	}

	if err := client.Mail(from); err != nil {
		return err
	}
	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return err
		}
	}

	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(msg); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func verificationEmailContent(code, purpose string) (subject, body string) {
	switch purpose {
	case PurposeRegister:
		subject = "Finclaw 注册验证码"
		body = fmt.Sprintf("你的 Finclaw 注册验证码是：%s\n\n验证码 10 分钟内有效，请勿泄露给他人。", code)
	case PurposeResetPassword:
		subject = "Finclaw 密码重置验证码"
		body = fmt.Sprintf("你的 Finclaw 密码重置验证码是：%s\n\n验证码 10 分钟内有效。如非本人操作，请忽略此邮件。", code)
	default:
		subject = "Finclaw 验证码"
		body = fmt.Sprintf("你的验证码是：%s\n\n验证码 10 分钟内有效。", code)
	}
	return subject, body
}

func formatMailError(err error) string {
	if err == nil {
		return ErrSMTPSendFailed.Error()
	}
	msg := err.Error()
	if strings.Contains(msg, "connection timed out") || strings.Contains(msg, "i/o timeout") {
		return "邮件发送失败：无法连接 SMTP 服务器，请检查 host/port 配置"
	}
	if strings.Contains(msg, "535") || strings.Contains(msg, "authentication") {
		return "邮件发送失败：邮箱账号或授权码错误"
	}
	return "邮件发送失败，请检查 SMTP 配置"
}
