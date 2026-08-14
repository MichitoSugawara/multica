//go:build !windows

package daemon

import (
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/creack/pty"
)

func TestLivePTYEcho(t *testing.T) {
	if os.Getenv("MULTICA_LIVE_PTY") != "1" {
		t.Skip("set MULTICA_LIVE_PTY=1 to probe a local shell PTY")
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	cmd := exec.Command(shell)
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("start pty: %v", err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_ = ptmx.Close()
	})
	_ = ptmx.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := ptmx.Write([]byte("echo dock-pty-ok\n")); err != nil {
		t.Fatalf("write pty: %v", err)
	}
	buf := make([]byte, 4096)
	var out strings.Builder
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		n, readErr := ptmx.Read(buf)
		if n > 0 {
			out.Write(buf[:n])
			if strings.Contains(out.String(), "dock-pty-ok") {
				return
			}
		}
		if readErr != nil {
			t.Fatalf("read pty: %v\noutput: %q", readErr, out.String())
		}
	}
	t.Fatalf("pty did not echo marker; output=%q", out.String())
}
