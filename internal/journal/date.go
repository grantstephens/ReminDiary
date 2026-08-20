// Package journal holds the domain model for diary entries: calendar dates,
// entries, the storage contract, and derived statistics. It contains no
// storage, UI, or file-format code.
package journal

import (
	"fmt"
	"time"
)

// dateLayout is the ISO-8601 calendar date layout used for both the public
// Date form and the bbolt key form.
const dateLayout = "2006-01-02"

// displayLayout is the human-facing form shown in the Write screen header.
const displayLayout = "Mon 2 Jan 2006"

// Date is a calendar date in ISO-8601 form, "2006-01-02".
//
// A Date is a calendar date, not an instant: it has no time and no zone.
// Construct one only through ParseDate, Today, or Date.Add so that the
// invariant "a Date is always a real, correctly padded date" holds everywhere.
// Because the form is zero-padded and fixed-width, lexicographic ordering of
// Dates is chronological ordering, which the bbolt key layout relies on.
type Date string

// ParseDate validates s and returns it as a Date.
func ParseDate(s string) (Date, error) {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return "", fmt.Errorf("invalid date %q: want YYYY-MM-DD", s)
	}
	// time.Parse accepts unpadded input such as "2026-8-9"; re-formatting and
	// comparing rejects anything that is not already canonical.
	if t.Format(dateLayout) != s {
		return "", fmt.Errorf("invalid date %q: want YYYY-MM-DD", s)
	}
	return Date(s), nil
}

// Today returns the calendar date of now in now's own location.
//
// The caller passes the instant, which keeps this function pure and lets tests
// pin a specific moment and zone.
func Today(now time.Time) Date {
	return Date(now.Format(dateLayout))
}

// Time returns the date as midnight UTC. It is the basis for all date
// arithmetic: doing the arithmetic in UTC means a local DST transition can
// never add or drop a day.
func (d Date) Time() time.Time {
	t, err := time.ParseInLocation(dateLayout, string(d), time.UTC)
	if err != nil {
		// Unreachable for Dates built through the constructors, which is the
		// only supported way to make one.
		return time.Time{}
	}
	return t
}

// Add returns the date days later, accepting negative values to go backwards.
func (d Date) Add(days int) Date {
	return Date(d.Time().AddDate(0, 0, days).Format(dateLayout))
}

// Year returns the calendar year.
func (d Date) Year() int { return d.Time().Year() }

// Month returns the calendar month.
func (d Date) Month() time.Month { return d.Time().Month() }

// Day returns the day of the month.
func (d Date) Day() int { return d.Time().Day() }

// String returns the ISO-8601 form.
func (d Date) String() string { return string(d) }

// Display returns the human-facing form, for example "Wed 19 Aug 2026".
func (d Date) Display() string { return d.Time().Format(displayLayout) }
