package memstore_test

import (
	"testing"

	"remindiary/internal/journal"
	"remindiary/internal/memstore"
	"remindiary/internal/storetest"
)

func TestMemStoreSatisfiesContract(t *testing.T) {
	storetest.Run(t, func(t *testing.T) journal.Store {
		return memstore.New()
	})
}
