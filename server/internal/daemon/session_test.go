package daemon

import (
	"testing"
	"time"
)

func TestPTYScrollbackKeepsTail(t *testing.T) {
	var buf ptyScrollback
	buf.append([]byte("hello "))
	buf.append([]byte("world"))
	if got := string(buf.snapshot()); got != "hello world" {
		t.Fatalf("snapshot = %q", got)
	}

	big := make([]byte, ptyScrollbackLimit+32)
	for i := range big {
		big[i] = 'a'
	}
	big[len(big)-1] = 'z'
	buf.append(big)
	got := buf.snapshot()
	if len(got) != ptyScrollbackLimit {
		t.Fatalf("len = %d, want %d", len(got), ptyScrollbackLimit)
	}
	if got[len(got)-1] != 'z' {
		t.Fatalf("tail = %q, want z", got[len(got)-1])
	}
}

func TestSessionManagerWaitUnblocksOnPut(t *testing.T) {
	m := newRuntimeSessionManager()
	done := make(chan *runtimeDockSession, 1)
	go func() {
		done <- m.wait("sess-1", time.Second)
	}()
	time.Sleep(20 * time.Millisecond)
	want := &runtimeDockSession{id: "sess-1", cancel: func() {}}
	m.put(want)
	select {
	case got := <-done:
		if got != want {
			t.Fatalf("wait returned %#v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("wait did not unblock after put")
	}
}

func TestSessionManagerWaitTimesOut(t *testing.T) {
	m := newRuntimeSessionManager()
	if got := m.wait("missing", 20*time.Millisecond); got != nil {
		t.Fatalf("wait = %#v, want nil", got)
	}
}
