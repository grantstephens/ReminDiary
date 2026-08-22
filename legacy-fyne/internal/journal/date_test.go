package journal

import (
	"testing"
	"time"
)

func TestParseDate(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		wantErr bool
	}{
		{"valid", "2026-08-19", false},
		{"leap day valid", "2024-02-29", false},
		{"leap day invalid", "2023-02-29", true},
		{"day out of range", "2026-02-30", true},
		{"month out of range", "2026-13-01", true},
		{"unpadded", "2026-8-9", true},
		{"slashes", "19/08/2026", true},
		{"empty", "", true},
		{"trailing time", "2026-08-19T00:00:00Z", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseDate(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("ParseDate(%q) = %q, want error", tt.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseDate(%q) returned error: %v", tt.in, err)
			}
			if string(got) != tt.in {
				t.Fatalf("ParseDate(%q) = %q, want %q", tt.in, got, tt.in)
			}
		})
	}
}

func TestDateAdd(t *testing.T) {
	tests := []struct {
		name string
		from Date
		days int
		want Date
	}{
		{"forward one day", "2026-08-19", 1, "2026-08-20"},
		{"back one day", "2026-08-19", -1, "2026-08-18"},
		{"month boundary forward", "2026-08-31", 1, "2026-09-01"},
		{"month boundary back", "2026-09-01", -1, "2026-08-31"},
		{"year boundary forward", "2026-12-31", 1, "2027-01-01"},
		{"year boundary back", "2027-01-01", -1, "2026-12-31"},
		{"into leap day", "2024-02-28", 1, "2024-02-29"},
		{"over missing leap day", "2023-02-28", 1, "2023-03-01"},
		{"zero", "2026-08-19", 0, "2026-08-19"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.from.Add(tt.days); got != tt.want {
				t.Fatalf("%q.Add(%d) = %q, want %q", tt.from, tt.days, got, tt.want)
			}
		})
	}
}

// Date arithmetic runs in UTC, so a local DST transition must not shift a date.
func TestDateAddAcrossDST(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skipf("tzdata unavailable: %v", err)
	}
	// 2026-03-08 is the US spring-forward day; 02:00 local does not exist.
	now := time.Date(2026, 3, 8, 1, 30, 0, 0, loc)
	today := Today(now)
	if today != "2026-03-08" {
		t.Fatalf("Today = %q, want 2026-03-08", today)
	}
	if got := today.Add(1); got != "2026-03-09" {
		t.Fatalf("Add(1) across DST = %q, want 2026-03-09", got)
	}
	if got := today.Add(-1); got != "2026-03-07" {
		t.Fatalf("Add(-1) across DST = %q, want 2026-03-07", got)
	}
}

func TestDateParts(t *testing.T) {
	d := Date("2026-08-19")
	if d.Year() != 2026 {
		t.Errorf("Year = %d, want 2026", d.Year())
	}
	if d.Month() != time.August {
		t.Errorf("Month = %v, want August", d.Month())
	}
	if d.Day() != 19 {
		t.Errorf("Day = %d, want 19", d.Day())
	}
	if d.String() != "2026-08-19" {
		t.Errorf("String = %q", d.String())
	}
	if got, want := d.Display(), "Wed 19 Aug 2026"; got != want {
		t.Errorf("Display = %q, want %q", got, want)
	}
}

// Lexicographic order must equal chronological order, which the bbolt key
// layout depends on.
func TestDateOrdering(t *testing.T) {
	if !(Date("2026-01-09") < Date("2026-01-10")) {
		t.Error("expected 2026-01-09 < 2026-01-10")
	}
	if !(Date("2025-12-31") < Date("2026-01-01")) {
		t.Error("expected 2025-12-31 < 2026-01-01")
	}
}
