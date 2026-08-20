package journal

import "time"

// Entry is one day's diary entry. Exactly one Entry may exist per Date.
//
// Created is set once, when the entry is first written, and preserved by later
// edits. Updated is set on every write. Both are UTC.
type Entry struct {
	Date    Date      `json:"date"`
	Body    string    `json:"body"`
	Created time.Time `json:"created"`
	Updated time.Time `json:"updated"`
}
