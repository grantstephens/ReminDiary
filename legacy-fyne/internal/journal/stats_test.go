package journal

import "testing"

func TestComputeStats(t *testing.T) {
	tests := []struct {
		name  string
		dates []Date
		today Date
		want  Stats
	}{
		{
			name:  "empty",
			dates: nil,
			today: "2026-08-19",
			want:  Stats{Current: 0, Longest: 0, Total: 0, Since: ""},
		},
		{
			name:  "written today only",
			dates: []Date{"2026-08-19"},
			today: "2026-08-19",
			want:  Stats{Current: 1, Longest: 1, Total: 1, Since: "2026-08-19"},
		},
		{
			name:  "three day run ending today",
			dates: []Date{"2026-08-17", "2026-08-18", "2026-08-19"},
			today: "2026-08-19",
			want:  Stats{Current: 3, Longest: 3, Total: 3, Since: "2026-08-17"},
		},
		{
			// The grace rule: today is not written yet, so the streak counts
			// back from yesterday instead of reading zero all morning.
			name:  "run ending yesterday still counts",
			dates: []Date{"2026-08-17", "2026-08-18"},
			today: "2026-08-19",
			want:  Stats{Current: 2, Longest: 2, Total: 2, Since: "2026-08-17"},
		},
		{
			name:  "gap of two days breaks the streak",
			dates: []Date{"2026-08-15", "2026-08-16"},
			today: "2026-08-19",
			want:  Stats{Current: 0, Longest: 2, Total: 2, Since: "2026-08-15"},
		},
		{
			name:  "longest is an older run",
			dates: []Date{"2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-08-19"},
			today: "2026-08-19",
			want:  Stats{Current: 1, Longest: 4, Total: 5, Since: "2026-01-01"},
		},
		{
			name:  "streak crosses a month boundary",
			dates: []Date{"2026-07-31", "2026-08-01", "2026-08-02"},
			today: "2026-08-02",
			want:  Stats{Current: 3, Longest: 3, Total: 3, Since: "2026-07-31"},
		},
		{
			name:  "streak crosses a leap day",
			dates: []Date{"2024-02-28", "2024-02-29", "2024-03-01"},
			today: "2024-03-01",
			want:  Stats{Current: 3, Longest: 3, Total: 3, Since: "2024-02-28"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ComputeStats(tt.dates, tt.today)
			if got != tt.want {
				t.Fatalf("ComputeStats = %+v, want %+v", got, tt.want)
			}
		})
	}
}

// ComputeStats must not depend on its input already being sorted.
func TestComputeStatsUnsortedInput(t *testing.T) {
	got := ComputeStats([]Date{"2026-08-19", "2026-08-17", "2026-08-18"}, "2026-08-19")
	want := Stats{Current: 3, Longest: 3, Total: 3, Since: "2026-08-17"}
	if got != want {
		t.Fatalf("ComputeStats = %+v, want %+v", got, want)
	}
}
