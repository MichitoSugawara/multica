package cli

import (
	"regexp"
	"strings"
)

// Terminal output rendering for non-interactive consumers (CLI subcommands
// and the session MCP server). A PTY scrollback is raw bytes with ANSI
// escapes; agents reading it as text need the escapes stripped and carriage
// return overwrites (progress bars, prompts redrawing themselves) collapsed
// to the visible result.
var (
	// OSC sequences: ESC ] ... terminated by BEL or ST (ESC \).
	ansiOSCRe = regexp.MustCompile(`\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?`)
	// CSI sequences: ESC [ parameter/intermediate bytes, one final byte.
	ansiCSIRe = regexp.MustCompile(`\x1b\[[0-9;:?=><!]*[ -/]*[@-~]`)
	// Remaining two-byte escapes (RIS, charset selection, keypad modes...).
	ansiEscRe = regexp.MustCompile(`\x1b[@-_=><]`)
)

// StripANSI removes ANSI escape sequences from s.
func StripANSI(s string) string {
	s = ansiOSCRe.ReplaceAllString(s, "")
	s = ansiCSIRe.ReplaceAllString(s, "")
	s = ansiEscRe.ReplaceAllString(s, "")
	return s
}

// RenderTerminalText converts raw PTY bytes into plain text suitable for an
// agent or a terminal-less CLI consumer. maxLines > 0 keeps only the last
// maxLines lines (the scrollback tail is what a human sees on screen).
func RenderTerminalText(raw []byte, maxLines int) string {
	s := StripANSI(string(raw))
	s = strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		if strings.ContainsRune(line, '\r') {
			// Carriage-return overwrite: the last non-empty segment is what
			// remained visible (progress bars rewrite the same line).
			segs := strings.Split(line, "\r")
			seg := segs[len(segs)-1]
			if strings.TrimSpace(seg) == "" {
				for j := len(segs) - 1; j >= 0; j-- {
					if strings.TrimSpace(segs[j]) != "" {
						seg = segs[j]
						break
					}
				}
			}
			line = seg
		}
		// Drop stray control bytes that survive (BEL, backspace, etc.).
		line = strings.Map(func(r rune) rune {
			if r < 0x20 && r != '\t' {
				return -1
			}
			return r
		}, line)
		lines[i] = strings.TrimRight(line, " ")
	}
	// Trim leading/trailing blank runs so short reads aren't all padding.
	start, end := 0, len(lines)
	for start < end && strings.TrimSpace(lines[start]) == "" {
		start++
	}
	for end > start && strings.TrimSpace(lines[end-1]) == "" {
		end--
	}
	lines = lines[start:end]
	if maxLines > 0 && len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}
	return strings.Join(lines, "\n")
}
