package api

import (
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

	// Snapshot the media index before the rows cascade away.
	media, err := s.store.ListOwnerMedia(r.Context(), owner)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account lookup failed")
		return
	}

	// The DB wipe is the authoritative act: it kills the oplog, the media index,
	// and every session (including the one used for this request).
	if err := s.store.DeleteOwner(r.Context(), owner); err != nil {
		writeError(w, http.StatusInternalServerError, "account deletion failed")
		return
	}

	// Best-effort chunk cleanup after the point of no return. A failure here only
	// orphans opaque ciphertext whose index (and key) no longer exist.
	for _, m := range media {
		for n := 0; n < m.Chunks; n++ {
			key := fmt.Sprintf("%s/%d", m.S3Key, n)
			if err := s.blobs.Delete(r.Context(), key); err != nil &&
				!errors.Is(err, blobs.ErrNotConfigured) && !errors.Is(err, blobs.ErrNotFound) {
				log.Printf("account delete: orphaned chunk %s: %v", key, err)
			}
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
