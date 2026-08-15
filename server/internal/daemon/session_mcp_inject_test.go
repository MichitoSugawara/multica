package daemon

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestInjectSessionMcpServerIntoExistingConfig(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	raw := json.RawMessage(`{"mcpServers":{"agent":{"command":"node","args":["agent.js"]}}}`)
	out, err := injectSessionMcpServer("claude", raw, "/usr/local/bin/multica")
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		McpServers map[string]map[string]any `json:"mcpServers"`
	}
	if err := json.Unmarshal(out, &document); err != nil {
		t.Fatal(err)
	}
	entry := document.McpServers["multica-session"]
	if entry == nil {
		t.Fatalf("multica-session missing: %#v", document.McpServers)
	}
	if entry["command"] != "/usr/local/bin/multica" {
		t.Fatalf("command = %#v", entry["command"])
	}
	args, _ := entry["args"].([]any)
	if len(args) != 1 || args[0] != "session-mcp" {
		t.Fatalf("args = %#v", entry["args"])
	}
	if document.McpServers["agent"]["command"] != "node" {
		t.Fatalf("agent entry lost: %#v", document.McpServers)
	}
}

func TestInjectSessionMcpServerSeedsEmptyConfigThroughRuntimeMerge(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	runtimeConfig := `{"mcpServers":{"runtime-only":{"command":"runtime-cmd"}}}`
	if err := os.WriteFile(filepath.Join(home, ".claude.json"), []byte(runtimeConfig), 0o600); err != nil {
		t.Fatal(err)
	}
	out, err := injectSessionMcpServer("claude", nil, "/usr/local/bin/multica")
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		McpServers map[string]map[string]any `json:"mcpServers"`
	}
	if err := json.Unmarshal(out, &document); err != nil {
		t.Fatal(err)
	}
	if document.McpServers["multica-session"] == nil {
		t.Fatalf("multica-session missing: %#v", document.McpServers)
	}
	// The runtime-level server must survive: seeding a config where none
	// existed switches providers like Claude to strict/managed mode, so the
	// merge has to carry the user's runtime servers along.
	if document.McpServers["runtime-only"] == nil {
		t.Fatalf("runtime-only lost: %#v", document.McpServers)
	}
}

func TestInjectSessionMcpServerNeverOverwritesUserEntry(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	raw := json.RawMessage(`{"mcpServers":{"multica-session":{"command":"custom"}}}`)
	out, err := injectSessionMcpServer("claude", raw, "/usr/local/bin/multica")
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		McpServers map[string]map[string]any `json:"mcpServers"`
	}
	if err := json.Unmarshal(out, &document); err != nil {
		t.Fatal(err)
	}
	if document.McpServers["multica-session"]["command"] != "custom" {
		t.Fatalf("user entry overwritten: %#v", document.McpServers)
	}
}

func TestInjectSessionMcpServerDisabledByEnv(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv(SessionMcpDisableEnv, "1")
	raw := json.RawMessage(`{"mcpServers":{}}`)
	out, err := injectSessionMcpServer("claude", raw, "/usr/local/bin/multica")
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != string(raw) {
		t.Fatalf("config changed while disabled: %s", string(out))
	}
}

func TestInjectSessionMcpServerNoBinaryIsNoop(t *testing.T) {
	raw := json.RawMessage(`{"mcpServers":{}}`)
	out, err := injectSessionMcpServer("claude", raw, "")
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != string(raw) {
		t.Fatalf("config changed without binary: %s", string(out))
	}
}
