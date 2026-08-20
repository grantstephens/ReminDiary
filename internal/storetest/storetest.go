// Package storetest holds the behavioural contract every journal.Store must
// satisfy. Running one suite against both the bbolt store and the in-memory
// fake is what stops the fake from quietly diverging from real behaviour.
package storetest

import (
	"errors"
	"testing"
	"time"

	"remindiary/internal/journal"
)

// Run executes the full contract against stores produced by newStore. Each
// subtest gets a fresh, empty store.
func Run(t *testing.T, newStore func(*testing.T) journal.Store) {
	t.Helper()

	ts := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	entry := func(d journal.Date, body string) journal.Entry {
		return journal.Entry{Date: d, Body: body, Created: ts, Updated: ts}
	}

	open := func(t *testing.T) journal.Store {
		t.Helper()
		s := newStore(t)
		t.Cleanup(func() {
			if err := s.Close(); err != nil {
				t.Errorf("Close: %v", err)
			}
		})
		return s
	}

	t.Run("GetMissing", func(t *testing.T) {
		s := open(t)
		got, ok, err := s.Get("2026-08-19")
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if ok {
			t.Fatalf("Get returned ok for missing date, entry %+v", got)
		}
	})

	t.Run("PutThenGet", func(t *testing.T) {
		s := open(t)
		want := entry("2026-08-19", "hello")
		if err := s.Put(want); err != nil {
			t.Fatalf("Put: %v", err)
		}
		got, ok, err := s.Get("2026-08-19")
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if !ok {
			t.Fatal("Get returned not-ok for a date just written")
		}
		if got.Body != want.Body || got.Date != want.Date {
			t.Fatalf("Get = %+v, want %+v", got, want)
		}
		if !got.Created.Equal(want.Created) || !got.Updated.Equal(want.Updated) {
			t.Fatalf("timestamps not round-tripped: got %+v, want %+v", got, want)
		}
	})

	t.Run("PutReplaces", func(t *testing.T) {
		s := open(t)
		if err := s.Put(entry("2026-08-19", "first")); err != nil {
			t.Fatalf("Put: %v", err)
		}
		if err := s.Put(entry("2026-08-19", "second")); err != nil {
			t.Fatalf("Put: %v", err)
		}
		got, _, err := s.Get("2026-08-19")
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if got.Body != "second" {
			t.Fatalf("Body = %q, want %q", got.Body, "second")
		}
		dates, err := s.Dates()
		if err != nil {
			t.Fatalf("Dates: %v", err)
		}
		if len(dates) != 1 {
			t.Fatalf("Dates = %v, want exactly one", dates)
		}
	})

	t.Run("Delete", func(t *testing.T) {
		s := open(t)
		if err := s.Put(entry("2026-08-19", "hello")); err != nil {
			t.Fatalf("Put: %v", err)
		}
		if err := s.Delete("2026-08-19"); err != nil {
			t.Fatalf("Delete: %v", err)
		}
		if _, ok, err := s.Get("2026-08-19"); err != nil || ok {
			t.Fatalf("Get after Delete: ok=%v err=%v, want ok=false err=nil", ok, err)
		}
	})

	t.Run("DeleteMissingIsNotAnError", func(t *testing.T) {
		s := open(t)
		if err := s.Delete("2026-08-19"); err != nil {
			t.Fatalf("Delete of missing date: %v", err)
		}
	})

	t.Run("DatesAscending", func(t *testing.T) {
		s := open(t)
		for _, d := range []journal.Date{"2026-01-10", "2025-12-31", "2026-01-09"} {
			if err := s.Put(entry(d, "x")); err != nil {
				t.Fatalf("Put %s: %v", d, err)
			}
		}
		got, err := s.Dates()
		if err != nil {
			t.Fatalf("Dates: %v", err)
		}
		want := []journal.Date{"2025-12-31", "2026-01-09", "2026-01-10"}
		if len(got) != len(want) {
			t.Fatalf("Dates = %v, want %v", got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("Dates = %v, want %v", got, want)
			}
		}
	})

	t.Run("AllAscending", func(t *testing.T) {
		s := open(t)
		for _, d := range []journal.Date{"2026-01-10", "2025-12-31"} {
			if err := s.Put(entry(d, string(d))); err != nil {
				t.Fatalf("Put %s: %v", d, err)
			}
		}
		var seen []journal.Date
		if err := s.All(func(e journal.Entry) error {
			seen = append(seen, e.Date)
			return nil
		}); err != nil {
			t.Fatalf("All: %v", err)
		}
		if len(seen) != 2 || seen[0] != "2025-12-31" || seen[1] != "2026-01-10" {
			t.Fatalf("All order = %v", seen)
		}
	})

	t.Run("AllPropagatesYieldError", func(t *testing.T) {
		s := open(t)
		if err := s.Put(entry("2026-08-19", "x")); err != nil {
			t.Fatalf("Put: %v", err)
		}
		sentinel := errors.New("stop")
		if err := s.All(func(journal.Entry) error { return sentinel }); !errors.Is(err, sentinel) {
			t.Fatalf("All error = %v, want %v", err, sentinel)
		}
	})

	t.Run("OnThisDayNewestFirst", func(t *testing.T) {
		s := open(t)
		for _, d := range []journal.Date{"2018-08-19", "2026-08-19", "2022-08-19", "2022-08-18", "2022-09-19"} {
			if err := s.Put(entry(d, string(d))); err != nil {
				t.Fatalf("Put %s: %v", d, err)
			}
		}
		got, err := s.OnThisDay(time.August, 19)
		if err != nil {
			t.Fatalf("OnThisDay: %v", err)
		}
		want := []journal.Date{"2026-08-19", "2022-08-19", "2018-08-19"}
		if len(got) != len(want) {
			t.Fatalf("OnThisDay = %v, want %v", got, want)
		}
		for i := range want {
			if got[i].Date != want[i] {
				t.Fatalf("OnThisDay = %v, want %v", got, want)
			}
		}
	})

	t.Run("OnThisDayLeapDayIsExact", func(t *testing.T) {
		s := open(t)
		if err := s.Put(entry("2024-02-29", "leap")); err != nil {
			t.Fatalf("Put: %v", err)
		}
		if err := s.Put(entry("2023-02-28", "not leap")); err != nil {
			t.Fatalf("Put: %v", err)
		}
		got, err := s.OnThisDay(time.February, 29)
		if err != nil {
			t.Fatalf("OnThisDay: %v", err)
		}
		if len(got) != 1 || got[0].Date != "2024-02-29" {
			t.Fatalf("OnThisDay(Feb 29) = %v, want only 2024-02-29", got)
		}
	})

	t.Run("OnThisDayEmpty", func(t *testing.T) {
		s := open(t)
		got, err := s.OnThisDay(time.August, 19)
		if err != nil {
			t.Fatalf("OnThisDay: %v", err)
		}
		if len(got) != 0 {
			t.Fatalf("OnThisDay = %v, want empty", got)
		}
	})

	t.Run("PutAllWritesEverything", func(t *testing.T) {
		s := open(t)
		batch := []journal.Entry{
			entry("2026-08-19", "a"),
			entry("2026-08-20", "b"),
			entry("2026-08-21", "c"),
		}
		if err := s.PutAll(batch); err != nil {
			t.Fatalf("PutAll: %v", err)
		}
		dates, err := s.Dates()
		if err != nil {
			t.Fatalf("Dates: %v", err)
		}
		if len(dates) != 3 {
			t.Fatalf("Dates = %v, want 3 entries", dates)
		}
	})

	t.Run("PutAllEmptyIsNoop", func(t *testing.T) {
		s := open(t)
		if err := s.PutAll(nil); err != nil {
			t.Fatalf("PutAll(nil): %v", err)
		}
		dates, err := s.Dates()
		if err != nil {
			t.Fatalf("Dates: %v", err)
		}
		if len(dates) != 0 {
			t.Fatalf("Dates = %v, want empty", dates)
		}
	})

	t.Run("PutAllOverwrites", func(t *testing.T) {
		s := open(t)
		if err := s.Put(entry("2026-08-19", "old")); err != nil {
			t.Fatalf("Put: %v", err)
		}
		if err := s.PutAll([]journal.Entry{entry("2026-08-19", "new")}); err != nil {
			t.Fatalf("PutAll: %v", err)
		}
		got, _, err := s.Get("2026-08-19")
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if got.Body != "new" {
			t.Fatalf("Body = %q, want %q", got.Body, "new")
		}
	})
}
