package common

import (
	"strings"
	"testing"
)

func TestAccountEmailEscapesCodeAndBrand(t *testing.T) {
	content := AccountEmailContent("<brand>", "<123456>", "", 10)
	for _, want := range []string{"&lt;brand&gt;", "&lt;123456&gt;", "10 分钟", "792521914@qq.com"} {
		if !strings.Contains(content, want) {
			t.Fatalf("missing %q", want)
		}
	}
	if strings.Contains(content, "<123456>") {
		t.Fatal("unescaped code")
	}
	for _, line := range strings.Split(content, "\r\n") {
		if len(line) > 998 {
			t.Fatalf("SMTP line exceeds limit: %d bytes", len(line))
		}
	}
}

func TestAccountEmailResetLinkPreservesQuery(t *testing.T) {
	content := AccountEmailContent("skymoni", "", "https://skymoni.com/user/reset?email=a%40b.com&token=test", 10)
	if !strings.Contains(content, `href="https://skymoni.com/user/reset?email=a%40b.com&amp;token=test"`) {
		t.Fatal("reset link was lost or not escaped")
	}
	if !strings.Contains(content, "重置密码") || strings.Contains(content, "letter-spacing:7px") {
		t.Fatal("wrong email variant")
	}
}
