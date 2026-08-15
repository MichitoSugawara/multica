package cli

import "testing"

func TestRenderTerminalTextStripsANSIAndCROverwrites(t *testing.T) {
	raw := []byte("\x1b[32muser@host\x1b[0m $ echo hi\r\nhi\r\nprogress 10%\rprogress 100%\r\n\x1b]0;title\x07done\r\n")
	got := RenderTerminalText(raw, 0)
	want := "user@host $ echo hi\nhi\nprogress 100%\ndone"
	if got != want {
		t.Fatalf("RenderTerminalText = %q, want %q", got, want)
	}
}

func TestRenderTerminalTextTailLines(t *testing.T) {
	raw := []byte("one\ntwo\nthree\nfour\n")
	got := RenderTerminalText(raw, 2)
	if got != "three\nfour" {
		t.Fatalf("tail = %q", got)
	}
}

func TestRenderTerminalTextEmpty(t *testing.T) {
	if got := RenderTerminalText(nil, 10); got != "" {
		t.Fatalf("empty = %q", got)
	}
}

func TestIssueSessionWSURL(t *testing.T) {
	cases := []struct{ in, want string }{
		{"http://localhost:8080", "ws://localhost:8080/api/issues/abc/runtime-session"},
		{"https://api.multica.ai/", "wss://api.multica.ai/api/issues/abc/runtime-session"},
		{"ws://localhost:8080/ws", "ws://localhost:8080/api/issues/abc/runtime-session"},
	}
	for _, c := range cases {
		got, err := IssueSessionWSURL(c.in, "abc")
		if err != nil {
			t.Fatalf("%s: %v", c.in, err)
		}
		if got != c.want {
			t.Fatalf("%s -> %q, want %q", c.in, got, c.want)
		}
	}
}
