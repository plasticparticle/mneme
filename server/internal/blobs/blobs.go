// Package blobs is the seam for media object storage (S3-compatible: MinIO/Garage).
// Media is uploaded client-encrypted and chunked; the relay only coordinates keys
// and (later) presigned URLs. Wiring is §10 step 5 — this is intentionally a stub
// so the architecture boundary exists before the implementation does.
//
// OPEN (§12): server-relayed upload vs. presigned S3 PUT. The interface below fits
// either — a relayed impl streams bytes, a presigned impl returns a URL.
package blobs

import (
	"context"
	"errors"

	"github.com/plasticparticle/mneme/server/internal/config"
)

// ErrNotImplemented is returned until a concrete media backend is wired up.
var ErrNotImplemented = errors.New("media storage not implemented yet (§10 step 5)")

// Coordinator coordinates client-encrypted, chunked media in object storage.
type Coordinator interface {
	// PresignPut returns an upload target for a media chunk key.
	PresignPut(ctx context.Context, ownerID, key string) (url string, err error)
	// PresignGet returns a download target for a media chunk key.
	PresignGet(ctx context.Context, ownerID, key string) (url string, err error)
}

// Disabled is a no-op Coordinator used when no object store is configured.
type Disabled struct{}

func (Disabled) PresignPut(context.Context, string, string) (string, error) {
	return "", ErrNotImplemented
}
func (Disabled) PresignGet(context.Context, string, string) (string, error) {
	return "", ErrNotImplemented
}

// New selects a Coordinator from config. Today it always returns Disabled; once a
// MinIO/Garage client lands, branch on cfg.Endpoint here.
func New(cfg config.S3Config) Coordinator {
	_ = cfg
	return Disabled{}
}
