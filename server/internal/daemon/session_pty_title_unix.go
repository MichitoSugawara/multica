//go:build !windows

package daemon

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/multica-ai/multica/server/pkg/protocol"
	"golang.org/x/sys/unix"
)

// ptyTitlePollInterval is a compromise between a tab label that feels live and
// one `ps` exec per session per tick. Titles are cosmetic, so a beat of lag on
// a short command is fine; long-running commands (the ones worth labelling)
// are caught immediately.
const ptyTitlePollInterval = 900 * time.Millisecond

// watchPTYTitle reports the PTY's foreground command as the tab title.
//
// The obvious mechanism — OSC 0/2 title escapes emitted by the shell — does not
// work here: zsh's default macOS setup only emits them under Terminal.app /
// iTerm, so a bare PTY never sends one. Instead we ask the tty which process
// group is in the foreground (TIOCGPGRP) and resolve its command name, which is
// exactly what a terminal emulator shows in its own tab.
//
// While the shell itself is in the foreground there is nothing interesting to
// name, so it emits an empty title and the client falls back to its numbered
// default ("Terminal 1") rather than pinning every idle tab to "zsh".
//
// Emits only on change, and stops when done is closed.
func (d *Daemon) watchPTYTitle(sessionID string, ptmx *os.File, shellPID int, done <-chan struct{}) {
	ticker := time.NewTicker(ptyTitlePollInterval)
	defer ticker.Stop()

	last := ""
	emitted := false
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			title := foregroundTitle(ptmx, shellPID)
			if emitted && title == last {
				continue
			}
			last = title
			emitted = true
			d.sendSessionTitle(sessionID, protocol.SessionKindPTY, title)
		}
	}
}

// foregroundTitle is "" when the tty has no readable foreground group or when
// that group is the shell itself.
func foregroundTitle(ptmx *os.File, shellPID int) string {
	pgid, err := unix.IoctlGetInt(int(ptmx.Fd()), unix.TIOCGPGRP)
	if err != nil || pgid <= 0 {
		return ""
	}
	if pgid == shellPID {
		return ""
	}
	return commandName(pgid)
}

// commandName resolves a pid to the name a user would recognise. `ps -o comm=`
// is available on both macOS and Linux and stays correct for setuid/renamed
// processes, where /proc parsing (Linux-only anyway) would need a fallback.
func commandName(pid int) string {
	out, err := exec.Command("ps", "-o", "comm=", "-p", strconv.Itoa(pid)).Output()
	if err != nil {
		return ""
	}
	name := strings.TrimSpace(string(out))
	if name == "" {
		return ""
	}
	// `ps` reports the absolute path on Linux and a leading "-" for login
	// shells on both platforms; neither reads well in a tab.
	name = filepath.Base(name)
	return strings.TrimPrefix(name, "-")
}
