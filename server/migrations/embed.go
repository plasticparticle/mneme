// Package migrations embeds the forward-only SQL migrations so the binary is
// fully self-contained (no migration files to ship alongside it).
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
