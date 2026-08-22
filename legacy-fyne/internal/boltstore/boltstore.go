// Package boltstore implements journal.Store on top of bbolt.
//
// Layout: bucket "entries" maps an ISO date key to a JSON-encoded
// journal.Entry. Because ISO date keys are fixed-width and zero-padded, bbolt's
// byte ordering is chronological, so ranged walks are plain cursor scans and no
// secondary index is needed. Bucket "meta" holds the schema version.
package boltstore

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/grantstephens/remindiary/internal/journal"
)

// SchemaVersion is the on-disk layout version this package writes and reads.
const SchemaVersion = 1

var (
	entriesBucket = []byte("entries")
	metaBucket    = []byte("meta")
	schemaKey     = []byte("schema_version")
)

// Store is a bbolt-backed journal.Store.
type Store struct {
	db *bolt.DB
}

// Open opens or creates the database at path.
//
// It returns an error if the database was written by a newer schema version
// than this binary understands, rather than reading it on a best-effort basis
// and risking silent data loss.
func Open(path string) (*Store, error) {
	db, err := bolt.Open(path, 0o600, &bolt.Options{Timeout: 5 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open database %s: %w", path, err)
	}
	if err := db.Update(func(tx *bolt.Tx) error {
		if _, err := tx.CreateBucketIfNotExists(entriesBucket); err != nil {
			return err
		}
		meta, err := tx.CreateBucketIfNotExists(metaBucket)
		if err != nil {
			return err
		}
		raw := meta.Get(schemaKey)
		if raw == nil {
			return meta.Put(schemaKey, []byte(strconv.Itoa(SchemaVersion)))
		}
		found, err := strconv.Atoi(string(raw))
		if err != nil {
			return fmt.Errorf("unreadable schema version %q", raw)
		}
		if found > SchemaVersion {
			return fmt.Errorf("database schema version %d is newer than this app supports (%d)", found, SchemaVersion)
		}
		return nil
	}); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// Close implements journal.Store.
func (s *Store) Close() error { return s.db.Close() }

// Get implements journal.Store.
func (s *Store) Get(d journal.Date) (journal.Entry, bool, error) {
	var (
		e     journal.Entry
		found bool
	)
	err := s.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket(entriesBucket).Get([]byte(d))
		if raw == nil {
			return nil
		}
		found = true
		return json.Unmarshal(raw, &e)
	})
	if err != nil {
		return journal.Entry{}, false, fmt.Errorf("get %s: %w", d, err)
	}
	return e, found, nil
}

// Put implements journal.Store.
func (s *Store) Put(e journal.Entry) error {
	return s.PutAll([]journal.Entry{e})
}

// PutAll implements journal.Store. One bbolt Update transaction covers the
// whole batch, so a failure part-way leaves the database untouched.
func (s *Store) PutAll(entries []journal.Entry) error {
	if len(entries) == 0 {
		return nil
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(entriesBucket)
		for _, e := range entries {
			if e.Date == "" {
				return fmt.Errorf("entry has no date")
			}
			raw, err := json.Marshal(e)
			if err != nil {
				return fmt.Errorf("encode %s: %w", e.Date, err)
			}
			if err := b.Put([]byte(e.Date), raw); err != nil {
				return fmt.Errorf("write %s: %w", e.Date, err)
			}
		}
		return nil
	})
}

// Delete implements journal.Store.
func (s *Store) Delete(d journal.Date) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(entriesBucket).Delete([]byte(d))
	})
}

// Dates implements journal.Store. It reads keys only, which is what makes the
// full-scan approach to statistics cheap.
func (s *Store) Dates() ([]journal.Date, error) {
	var out []journal.Date
	err := s.db.View(func(tx *bolt.Tx) error {
		c := tx.Bucket(entriesBucket).Cursor()
		for k, _ := c.First(); k != nil; k, _ = c.Next() {
			out = append(out, journal.Date(k))
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("list dates: %w", err)
	}
	return out, nil
}

// All implements journal.Store.
func (s *Store) All(yield func(journal.Entry) error) error {
	return s.db.View(func(tx *bolt.Tx) error {
		c := tx.Bucket(entriesBucket).Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var e journal.Entry
			if err := json.Unmarshal(v, &e); err != nil {
				return fmt.Errorf("decode %s: %w", k, err)
			}
			if err := yield(e); err != nil {
				return err
			}
		}
		return nil
	})
}

// OnThisDay implements journal.Store. It scans keys and matches the "-MM-DD"
// suffix; at roughly 365 keys per year of journalling this is fast enough that
// an index bucket would only add invalidation bugs.
func (s *Store) OnThisDay(month time.Month, day int) ([]journal.Entry, error) {
	suffix := fmt.Sprintf("-%02d-%02d", int(month), day)
	var out []journal.Entry
	err := s.db.View(func(tx *bolt.Tx) error {
		c := tx.Bucket(entriesBucket).Cursor()
		// Walking backwards yields newest-first directly, since key order is
		// chronological.
		for k, v := c.Last(); k != nil; k, v = c.Prev() {
			if len(k) != len("2006-01-02") || string(k[4:]) != suffix {
				continue
			}
			var e journal.Entry
			if err := json.Unmarshal(v, &e); err != nil {
				return fmt.Errorf("decode %s: %w", k, err)
			}
			out = append(out, e)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("on this day %02d-%02d: %w", int(month), day, err)
	}
	return out, nil
}

// WriteSchemaVersionForTest forces a schema version into the database at path.
// It exists so tests can construct a database from a hypothetical future
// version; production code never calls it.
func WriteSchemaVersionForTest(path string, version int) error {
	db, err := bolt.Open(path, 0o600, &bolt.Options{Timeout: 5 * time.Second})
	if err != nil {
		return err
	}
	defer db.Close()
	return db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists(metaBucket)
		if err != nil {
			return err
		}
		return b.Put(schemaKey, []byte(strconv.Itoa(version)))
	})
}
