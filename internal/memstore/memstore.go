// Package memstore provides an in-memory journal.Store. It exists so that
// domain, CSV, and UI tests can run without touching a database file.
package memstore

import (
	"sort"
	"time"

	"remindiary/internal/journal"
)

// Store is an in-memory journal.Store. The zero value is not usable; call New.
type Store struct {
	entries map[journal.Date]journal.Entry
}

// New returns an empty Store.
func New() *Store {
	return &Store{entries: make(map[journal.Date]journal.Entry)}
}

// Get implements journal.Store.
func (s *Store) Get(d journal.Date) (journal.Entry, bool, error) {
	e, ok := s.entries[d]
	return e, ok, nil
}

// Put implements journal.Store.
func (s *Store) Put(e journal.Entry) error {
	s.entries[e.Date] = e
	return nil
}

// PutAll implements journal.Store. The map is only mutated after the whole
// batch is accepted, matching the atomicity the bbolt store provides.
func (s *Store) PutAll(entries []journal.Entry) error {
	staged := make(map[journal.Date]journal.Entry, len(entries))
	for _, e := range entries {
		staged[e.Date] = e
	}
	for d, e := range staged {
		s.entries[d] = e
	}
	return nil
}

// Delete implements journal.Store.
func (s *Store) Delete(d journal.Date) error {
	delete(s.entries, d)
	return nil
}

// OnThisDay implements journal.Store.
func (s *Store) OnThisDay(month time.Month, day int) ([]journal.Entry, error) {
	var out []journal.Entry
	for _, e := range s.entries {
		if e.Date.Month() == month && e.Date.Day() == day {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date > out[j].Date })
	return out, nil
}

// Dates implements journal.Store.
func (s *Store) Dates() ([]journal.Date, error) {
	out := make([]journal.Date, 0, len(s.entries))
	for d := range s.entries {
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out, nil
}

// All implements journal.Store.
func (s *Store) All(yield func(journal.Entry) error) error {
	dates, err := s.Dates()
	if err != nil {
		return err
	}
	for _, d := range dates {
		if err := yield(s.entries[d]); err != nil {
			return err
		}
	}
	return nil
}

// Close implements journal.Store. It is a no-op.
func (s *Store) Close() error { return nil }
