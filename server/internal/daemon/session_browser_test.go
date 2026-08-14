package daemon

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestFindChromiumEnvOverride(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "chrome")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write fake chrome: %v", err)
	}
	t.Setenv("MULTICA_CHROMIUM_PATH", bin)
	got, err := findChromium()
	if err != nil {
		t.Fatalf("findChromium: %v", err)
	}
	if got != bin {
		t.Fatalf("findChromium = %q, want %q", got, bin)
	}
}

func TestFindChromiumEnvOverrideRejectsMissingPath(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing-chrome")
	t.Setenv("MULTICA_CHROMIUM_PATH", missing)
	got, _ := findChromium()
	if got == missing {
		t.Fatal("used a missing MULTICA_CHROMIUM_PATH")
	}
}

func TestParseDevToolsListeningURL(t *testing.T) {
	got := parseDevToolsListeningURL("DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc")
	if got != "ws://127.0.0.1:9222/devtools/browser/abc" {
		t.Fatalf("got %q", got)
	}
	if parseDevToolsListeningURL("unrelated") != "" {
		t.Fatal("expected empty")
	}
}

func TestResolvePageDevToolsURLPassthrough(t *testing.T) {
	page := "ws://127.0.0.1:9222/devtools/page/abc"
	if got := resolvePageDevToolsURL(page); got != page {
		t.Fatalf("got %q", got)
	}
}

func TestChromiumLaunchArgsAllowRemoteOrigins(t *testing.T) {
	args := chromiumLaunchArgs("/tmp/chrome", 800, 600)
	found := false
	for _, arg := range args {
		if arg == "--remote-allow-origins=*" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("missing --remote-allow-origins=*")
	}
}

func TestLiveChromiumAttach(t *testing.T) {
	if os.Getenv("MULTICA_LIVE_CHROME") != "1" {
		t.Skip("set MULTICA_LIVE_CHROME=1 to probe the local Chrome install")
	}
	chrome, err := findChromium()
	if err != nil {
		t.Fatalf("findChromium: %v", err)
	}
	userDir := t.TempDir()
	cmd := exec.Command(chrome, chromiumLaunchArgs(userDir, 800, 600)...)
	cmd.Dir = userDir
	stderr, err := cmd.StderrPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatalf("start chrome: %v", err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	wsURL, err := waitDevToolsWSURL(filepath.Join(userDir, "DevToolsActivePort"), stderr, 8*time.Second)
	if err != nil {
		t.Fatalf("devtools url: %v", err)
	}
	cdp, err := dialCDP(wsURL)
	if err != nil {
		t.Fatalf("dial cdp: %v", err)
	}
	t.Cleanup(func() { cdp.close() })
	done := make(chan error, 1)
	go func() { done <- cdp.readLoop() }()
	if err := cdp.call("Page.enable", nil); err != nil {
		t.Fatalf("Page.enable: %v", err)
	}
	if err := applyBrowserViewport(cdp, 800, 600); err != nil {
		t.Fatalf("screencast: %v", err)
	}
}
