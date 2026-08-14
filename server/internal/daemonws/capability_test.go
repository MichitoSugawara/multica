package daemonws

import "testing"

func TestHasCapability(t *testing.T) {
	if !HasCapability("rpc-v1,pty-v1,browser-v1", "pty-v1") {
		t.Fatal("expected pty-v1")
	}
	if HasCapability("rpc-v1,browser-v1", "pty-v1") {
		t.Fatal("did not expect pty-v1")
	}
	if !HasCapability(" pty-v1 ", "pty-v1") {
		t.Fatal("expected trimmed match")
	}
}
