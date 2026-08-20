package journal

import "time"

// Store persists entries, keyed by calendar date.
//
// Implementations must be safe for use from a single goroutine; the app drives
// all access from the UI goroutine. Every method returns an error rather than
// panicking, because a failure on a user's phone must become a dialog, not a
// crash.
type Store interface {
	// Get returns the entry for d. The bool reports whether one exists; a
	// missing entry is not an error.
	Get(d Date) (Entry, bool, error)

	// Put writes e, replacing any existing entry for e.Date.
	Put(e Entry) error

	// PutAll writes every entry atomically: either all of them land or, if the
	// write fails, none do. It is what makes CSV import all-or-nothing.
	PutAll(entries []Entry) error

	// Delete removes the entry for d. Deleting a date with no entry is not an
	// error.
	Delete(d Date) error

	// OnThisDay returns every entry falling on the given month and day, in any
	// year present, ordered newest year first. It includes the current year if
	// an entry exists; filtering that out belongs to the caller.
	OnThisDay(month time.Month, day int) ([]Entry, error)

	// Dates returns every date that has an entry, in ascending order.
	Dates() ([]Date, error)

	// All calls yield for every entry in ascending date order. If yield returns
	// an error, iteration stops and All returns that error.
	All(yield func(Entry) error) error

	// Close releases the underlying resources.
	Close() error
}
