package main

import (
	"bytes"
	"embed"
	"flag"
	"html/template"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"time"
)

//go:embed templates/*.html static/*
var content embed.FS

type option struct {
	Value string
	Label string
}

type pageData struct {
	Title             string
	WinningScore      int
	DefaultDifficulty string
	Difficulties      []option
}

func newHandler() (http.Handler, error) {
	pages, err := template.ParseFS(content, "templates/*.html")
	if err != nil {
		return nil, err
	}

	static, err := fs.Sub(content, "static")
	if err != nil {
		return nil, err
	}

	mux := http.NewServeMux()
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(static))))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		data := pageData{
			Title:             "GO PONG — Arcade Ping Pong",
			WinningScore:      7,
			DefaultDifficulty: "normal",
			Difficulties: []option{
				{Value: "easy", Label: "Easy"},
				{Value: "normal", Label: "Normal"},
				{Value: "hard", Label: "Hard"},
			},
		}

		// Render into a buffer so a template error cannot leave a half-written page.
		var output bytes.Buffer
		if err := pages.ExecuteTemplate(&output, "index.html", data); err != nil {
			slog.Error("rendering template", "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = output.WriteTo(w)
	})
	return mux, nil
}

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	flag.Parse()

	handler, err := newHandler()
	if err != nil {
		slog.Error("initializing server", "error", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr:              *addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("pong server started", "addr", *addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}
