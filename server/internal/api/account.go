package api

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/plasticparticle/mneme/server/internal/blobs"
)

// DELETE /v1/account — wipe the authenticated owner entirely: entry blobs, media
// chunks, reminders, devices and sessions. This exists for mnemonic rotation: the
// client re-encrypts the vault under a fresh phrase (a new owner_id), pushes it,
// and then deletes the old account so a leaked phrase unlocks nothing. The relay
// cannot rotate keys itself (it has none) — deletion is its entire contribution.
func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	owner := principalOf(r.Context()).OwnerID
	if _, err := s.wipeOwner(r.Context(), owner); err != nil {
		writeError(w, http.StatusInternalServerError, "account deletion failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// wipeOwner deletes everything stored for an owner — used by self-service account
// deletion (above) and the operator's vault deletion (admin.go). found=false when
// the owner did not exist.
func (s *Server) wipeOwner(ctx context.Context, owner string) (found bool, err error) {
	// Snapshot the media index before the rows cascade away.
	media, err := s.store.ListOwnerMedia(ctx, owner)
	if err != nil {
		return false, err
	}

	// The DB wipe is the authoritative act: it kills the oplog, the media index,
	// and every session (including, for self-deletion, the one making the request).
	found, err = s.store.DeleteOwner(ctx, owner)
	if err != nil {
		return false, err
	}
	if !found {
		return false, nil
	}
	s.metrics.bump(metricVaultsDeleted, 1)

	// Best-effort chunk cleanup after the point of no return. A failure here only
	// orphans opaque ciphertext whose index (and key) no longer exist.
	for _, m := range media {
		for n := 0; n < m.Chunks; n++ {
			key := fmt.Sprintf("%s/%d", m.S3Key, n)
			if err := s.blobs.Delete(ctx, key); err != nil &&
				!errors.Is(err, blobs.ErrNotConfigured) && !errors.Is(err, blobs.ErrNotFound) {
				log.Printf("owner wipe: orphaned chunk %s: %v", key, err)
			}
		}
	}
	return true, nil
}
