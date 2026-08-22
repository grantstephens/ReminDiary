package journal

import "sort"

// Stats are the writing statistics shown on the Stats screen. They are always
// derived from the set of dates that have entries and never stored, which rules
// out a whole class of cache-invalidation bugs.
type Stats struct {
	// Current is the number of consecutive days written, ending today or,
	// if today is not written yet, ending yesterday.
	Current int
	// Longest is the longest run of consecutive days anywhere in the data.
	Longest int
	// Total is the number of entries.
	Total int
	// Since is the earliest date with an entry, empty when there are none.
	Since Date
}

// ComputeStats derives statistics from the dates that have entries. The input
// need not be sorted.
func ComputeStats(dates []Date, today Date) Stats {
	if len(dates) == 0 {
		return Stats{}
	}

	sorted := make([]Date, len(dates))
	copy(sorted, dates)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	present := make(map[Date]bool, len(sorted))
	for _, d := range sorted {
		present[d] = true
	}

	stats := Stats{
		Total: len(sorted),
		Since: sorted[0],
	}

	run := 1
	stats.Longest = 1
	for i := 1; i < len(sorted); i++ {
		if sorted[i-1].Add(1) == sorted[i] {
			run++
		} else {
			run = 1
		}
		if run > stats.Longest {
			stats.Longest = run
		}
	}

	// Grace rule: an unwritten today does not end the streak, an unwritten
	// yesterday does.
	cursor := today
	if !present[cursor] {
		cursor = cursor.Add(-1)
	}
	for present[cursor] {
		stats.Current++
		cursor = cursor.Add(-1)
	}

	return stats
}
