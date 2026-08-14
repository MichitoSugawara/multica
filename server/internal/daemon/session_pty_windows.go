//go:build windows

package daemon

import "github.com/multica-ai/multica/server/pkg/protocol"

func (d *Daemon) openPTYSession(p protocol.SessionOpenPayload) {
	d.sendSessionError(p.SessionID, protocol.SessionErrorUnsupportedOS, "terminal sessions are not supported on Windows")
}
