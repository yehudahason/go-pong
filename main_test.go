package main

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func TestHomeRendersTemplate(t *testing.T) {
	h, err := newHandler()
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/", nil))
	t.Log(rr.Body.String())
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}

	for _, snippet := range []string{
		"GO PONG",
		`data-win-score="7"`,
	} {
		if !strings.Contains(rr.Body.String(), snippet) {
			t.Errorf("rendered HTML does not contain %q", snippet)
		}
	}

	normalOption := regexp.MustCompile(
		`(?s)<option\s+value="normal"\s+selected\s*>`,
	)

	if !normalOption.MatchString(rr.Body.String()) {
		t.Error("normal difficulty is not selected by default")
	}
}

func TestStaticAssets(t *testing.T) {
	h, err := newHandler()
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/static/style.css", "/static/game.js"} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, nil))
		if rr.Code != http.StatusOK || rr.Body.Len() == 0 {
			t.Errorf("GET %s: status %d, length %d", path, rr.Code, rr.Body.Len())
		}
	}
}

func TestOtherPathsNotFound(t *testing.T) {
	h, err := newHandler()
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/not-a-page", nil))
	if rr.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rr.Code)
	}
}
