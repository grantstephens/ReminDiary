package boltstore_test

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/grantstephens/remindiary/internal/boltstore"
	"github.com/grantstephens/remindiary/internal/journal"
	"github.com/grantstephens/remindiary/internal/storetest"
)

func TestBoltStoreSatisfiesContract(t *testing.T) {
	storetest.Run(t, func(t *testing.T) journal.Store {
		s, err := boltstore.Open(filepath.Join(t.TempDir(), "journal.db"))
		if err != nil {
			t.Fatalf("Open: %v", err)
		}
		return s
	})
}

func TestPersistsAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	ts := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)

	s, err := boltstore.Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := s.Put(journal.Entry{Date: "2026-08-19", Body: "hello", Created: ts, Updated: ts}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	reopened, err := boltstore.Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer reopened.Close()

	got, ok, err := reopened.Get("2026-08-19")
	if err != nil || !ok {
		t.Fatalf("Get after reopen: ok=%v err=%v", ok, err)
	}
	if got.Body != "hello" {
		t.Fatalf("Body = %q, want %q", got.Body, "hello")
	}
	if !got.Created.Equal(ts) {
		t.Fatalf("Created = %v, want %v", got.Created, ts)
	}
}

func TestRejectsNewerSchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	s, err := boltstore.Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := boltstore.WriteSchemaVersionForTest(path, boltstore.SchemaVersion+1); err != nil {
		t.Fatalf("WriteSchemaVersionForTest: %v", err)
	}
	reopened, err := boltstore.Open(path)
	if err == nil {
		reopened.Close()
		t.Fatal("Open of a newer-schema database succeeded, want error")
	}
}

func TestPutAllIsAtomic(t *testing.T) {
	path := filepath.Join(t.TempDir(), "journal.db")
	s, err := boltstore.Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	// An entry with an empty Date cannot be keyed, so the batch must be
	// rejected in full and leave the store untouched.
	batch := []journal.Entry{
		{Date: "2026-08-19", Body: "good"},
		{Date: "", Body: "broken"},
	}
	if err := s.PutAll(batch); err == nil {
		t.Fatal("PutAll with an invalid entry succeeded, want error")
	}
	dates, err := s.Dates()
	if err != nil {
		t.Fatalf("Dates: %v", err)
	}
	if len(dates) != 0 {
		t.Fatalf("Dates = %v, want empty after a failed PutAll", dates)
	}
}
