package store

import "testing"

func TestVersionOf(t *testing.T) {
	cases := map[string]int{
		"0001_init.sql":          1,
		"0002_add_templates.sql": 2,
		"0042_whatever.sql":      42,
		"10.sql":                 10,
	}
	for name, want := range cases {
		got, err := versionOf(name)
		if err != nil {
			t.Fatalf("versionOf(%q) error: %v", name, err)
		}
		if got != want {
			t.Fatalf("versionOf(%q) = %d, want %d", name, got, want)
		}
	}

	if _, err := versionOf("nope.sql"); err == nil {
		t.Fatal("versionOf(\"nope.sql\") should error on missing version number")
	}
}
