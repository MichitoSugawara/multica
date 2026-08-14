//go:build !windows

package daemon

import (
	"os"
	"os/exec"
	"testing"
	"time"

	"github.com/creack/pty"
)

func TestForegroundTitleIgnoresTheShellItself(t *testing.T) {
	cmd := exec.Command("/bin/sh")
	ptmx, err := pty.Start(cmd)
	if err != nil {
		t.Skipf("pty unavailable: %v", err)
	}
	t.Cleanup(func() {
		_ = ptmx.Close()
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})

	// The shell is the only thing running, so there is no interesting name to
	// show and the client should fall back to its numbered default.
	if got := foregroundTitle(ptmx, cmd.Process.Pid); got != "" {
		t.Fatalf("foregroundTitle on idle shell = %q, want empty", got)
	}
}

func TestForegroundTitleReportsRunningCommand(t *testing.T) {
	cmd := exec.Command("/bin/sh")
	ptmx, err := pty.Start(cmd)
	if err != nil {
		t.Skipf("pty unavailable: %v", err)
	}
	t.Cleanup(func() {
		_ = ptmx.Close()
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})

	if _, err := ptmx.Write([]byte("sleep 5\n")); err != nil {
		t.Fatalf("write to pty: %v", err)
	}
	// Drain output so the shell is never blocked on a full pty buffer.
	go func() {
		buf := make([]byte, 1024)
		for {
			if _, err := ptmx.Read(buf); err != nil {
				return
			}
		}
	}()

	deadline := time.Now().Add(4 * time.Second)
	for {
		if got := foregroundTitle(ptmx, cmd.Process.Pid); got == "sleep" {
			return
		} else if time.Now().After(deadline) {
			t.Fatalf("foregroundTitle never reported the running command (last %q)", got)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestCommandNameStripsPathAndLoginDash(t *testing.T) {
	if got := commandName(os.Getpid()); got == "" {
		t.Fatal("commandName(self) returned empty")
	}
}

func TestBrowserSessionTitleUsesHostAndPort(t *testing.T) {
	cases := map[string]string{
		"http://localhost:3000/dalecode/issues/DALE-2": "localhost:3000",
		"https://github.com/multica-ai/multica":        "github.com",
		"about:blank":                                  "",
		"":                                             "",
	}
	for raw, want := range cases {
		if got := browserSessionTitle(raw); got != want {
			t.Errorf("browserSessionTitle(%q) = %q, want %q", raw, got, want)
		}
	}
}
