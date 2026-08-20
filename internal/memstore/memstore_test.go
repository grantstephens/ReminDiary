package memstore_test

import (
	"testing"

	"github.com/grantstephens/remindiary/internal/journal"
	"github.com/grantstephens/remindiary/internal/memstore"
	"github.com/grantstephens/remindiary/internal/storetest"
)

func TestMemStoreSatisfiesContract(t *testing.T) {
	storetest.Run(t, func(t *testing.T) journal.Store {
		return memstore.New()
	})
}
