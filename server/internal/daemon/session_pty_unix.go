//go:build !windows

package daemon

import (
	"encoding/base64"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

func (d *Daemon) openPTYSession(p protocol.SessionOpenPayload) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	cwd := p.Cwd
	if cwd == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "could not resolve home directory")
			return
		}
		cwd = home
	}
	if st, err := os.Stat(cwd); err != nil || !st.IsDir() {
		home, homeErr := os.UserHomeDir()
		if homeErr != nil {
			d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "working directory is not usable")
			return
		}
		cwd = home
	}

	cmd := exec.Command(shell)
	cmd.Dir = cwd
	cmd.Env = os.Environ()
	cols, rows := p.Cols, p.Rows
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, err.Error())
		return
	}

	var once sync.Once
	titleDone := make(chan struct{})
	cancel := func() {
		once.Do(func() {
			close(titleDone)
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			_ = ptmx.Close()
		})
	}

	var scrollback ptyScrollback

	sess := &runtimeDockSession{
		id:     p.SessionID,
		kind:   protocol.SessionKindPTY,
		cancel: cancel,
		input: func(data string) {
			raw, err := base64.StdEncoding.DecodeString(data)
			if err != nil {
				raw = []byte(data)
			}
			_, _ = ptmx.Write(raw)
		},
		resize: func(c, r int) {
			if c <= 0 || r <= 0 {
				return
			}
			_ = pty.Setsize(ptmx, &pty.Winsize{Cols: uint16(c), Rows: uint16(r)})
		},
		dumpSnapshot: func() {
			d.sendPTYSnapshot(p.SessionID, scrollback.snapshot())
		},
	}
	d.sessions.put(sess)
	d.sendSessionReady(p.SessionID, protocol.SessionKindPTY, "")
	shellPID := 0
	if cmd.Process != nil {
		shellPID = cmd.Process.Pid
	}
	go d.watchPTYTitle(p.SessionID, ptmx, shellPID, titleDone)

	go func() {
		defer cancel()
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				chunk := buf[:n]
				scrollback.append(chunk)
				d.sendSessionJSON(protocol.EventDaemonSessionData, protocol.SessionDataPayload{
					SessionID: p.SessionID,
					Kind:      protocol.SessionKindPTY,
					Mime:      "application/octet-stream",
					Data:      base64.StdEncoding.EncodeToString(chunk),
				})
			}
			if err != nil {
				if err != io.EOF {
					d.logger.Debug("pty read ended", "session_id", p.SessionID, "error", err)
				}
				if cmd.Process != nil {
					_ = cmd.Process.Signal(syscall.SIGKILL)
				}
				d.sendSessionClose(p.SessionID, "pty_exit")
				return
			}
		}
	}()
}
