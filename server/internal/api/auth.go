package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"time"
)

const (
	x25519PubLen    = 32
	challengeTTL    = 2 * time.Minute
	sessionTokenLen = 32
)

// registerMessage is what a device signs to prove possession of its private key.
func registerMessage(ownerPub, devicePub []byte) []byte {
	msg := append([]byte("mneme:register:"), ownerPub...)
	return append(msg, devicePub...)
}

// POST /v1/register
// Trust-on-first-use: the first device for an owner creates the owner. Binding an
// additional device to an existing owner currently also succeeds (TOFU per device).
// TODO(§6 pairing): require the request to be authorized by the owner identity key
// (or an existing device session) before honest multi-device pairing ships.
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OwnerPubkey  string `json:"owner_pubkey"`  // base64, X25519 (32 bytes)
		DevicePubkey string `json:"device_pubkey"` // base64, Ed25519 (32 bytes)
		Signature    string `json:"signature"`     // base64, device-signed registerMessage
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	ownerPub, err := base64.StdEncoding.DecodeString(req.OwnerPubkey)
	if err != nil || len(ownerPub) != x25519PubLen {
		writeError(w, http.StatusBadRequest, "owner_pubkey must be 32 base64-encoded bytes")
		return
	}
	devicePub, err := base64.StdEncoding.DecodeString(req.DevicePubkey)
	if err != nil || len(devicePub) != ed25519.PublicKeySize {
		writeError(w, http.StatusBadRequest, "device_pubkey must be 32 base64-encoded bytes")
		return
	}
	sig, err := base64.StdEncoding.DecodeString(req.Signature)
	if err != nil {
		writeError(w, http.StatusBadRequest, "signature must be base64")
		return
	}
	if !ed25519.Verify(ed25519.PublicKey(devicePub), registerMessage(ownerPub, devicePub), sig) {
		writeError(w, http.StatusUnauthorized, "signature does not verify against device_pubkey")
		return
	}

	ownerID := deriveID(ownerPub)
	deviceID := deriveID(devicePub)
	ownerCreated, err := s.store.RegisterOwnerDevice(r.Context(), ownerID, ownerPub, deviceID, devicePub)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "registration failed")
		return
	}
	if ownerCreated {
		s.metrics.bump(metricVaultsCreated, 1)
	}
	writeJSON(w, http.StatusOK, map[string]string{"owner_id": ownerID, "device_id": deviceID})
}

// POST /v1/auth/challenge
func (s *Server) handleChallenge(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceID string `json:"device_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if _, _, err := s.store.DevicePubkey(r.Context(), req.DeviceID); err != nil {
		writeError(w, http.StatusNotFound, "unknown device")
		return
	}

	nonce := make([]byte, 32)
	if _, err := rand.Read(nonce); err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate challenge")
		return
	}
	expires := time.Now().Add(challengeTTL)
	if err := s.store.SaveChallenge(r.Context(), req.DeviceID, nonce, expires); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store challenge")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"challenge":  base64.StdEncoding.EncodeToString(nonce),
		"expires_at": expires.UTC().Format(time.RFC3339),
	})
}

// POST /v1/auth/verify
func (s *Server) handleVerify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceID  string `json:"device_id"`
		Challenge string `json:"challenge"`
		Signature string `json:"signature"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	challenge, err := base64.StdEncoding.DecodeString(req.Challenge)
	if err != nil {
		writeError(w, http.StatusBadRequest, "challenge must be base64")
		return
	}
	sig, err := base64.StdEncoding.DecodeString(req.Signature)
	if err != nil {
		writeError(w, http.StatusBadRequest, "signature must be base64")
		return
	}

	ownerID, pub, err := s.store.DevicePubkey(r.Context(), req.DeviceID)
	if err != nil {
		writeError(w, http.StatusNotFound, "unknown device")
		return
	}
	if !ed25519.Verify(ed25519.PublicKey(pub), challenge, sig) {
		writeError(w, http.StatusUnauthorized, "signature does not verify")
		return
	}
	// Single-use: consume the challenge only after the signature checks out.
	ok, err := s.store.ConsumeChallenge(r.Context(), req.DeviceID, challenge)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "challenge lookup failed")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "challenge expired or already used")
		return
	}

	tokenBytes := make([]byte, sessionTokenLen)
	if _, err := rand.Read(tokenBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue session")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	hash := sha256.Sum256([]byte(token))
	expires := time.Now().Add(s.cfg.SessionTTL)
	if err := s.store.CreateSession(r.Context(), hash[:], req.DeviceID, ownerID, expires); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token":      token,
		"owner_id":   ownerID,
		"expires_at": expires.UTC().Format(time.RFC3339),
	})
}
