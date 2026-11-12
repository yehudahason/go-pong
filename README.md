# GO PONG

A fully playable browser Ping Pong (Pong) game served by **Go** using its standard-library **`html/template`** package. No external Go packages, build steps, or JavaScript dependencies.

## Run

Install Go 1.22+ and run:

```bash
go run .
```

Open **http://localhost:8080**.

To change the port:

```bash
go run . -addr :3000
```

To build a standalone executable (HTML/CSS/JS are embedded):

```bash
go build -o pong .
./pong
```

## Controls

- **W / S:** left paddle (you).
- **↑ / ↓:** your paddle against CPU; right paddle in local two-player mode.
- **Space:** start or pause/resume.
- **Touch or mouse:** drag/move in the court to control the left paddle.
- First player to 7 wins. Choose CPU difficulty or local two-player mode in the toolbar.

## How the Go template engine is used

The `//go:embed` directive embeds `templates/index.html` and `static/*` in the Go binary. `template.ParseFS` compiles the HTML template and `ExecuteTemplate` renders it with `pageData` for the title, winning score, and difficulty choices. The HTTP server serves `/` from the template and `/static/` from the embedded filesystem.

The browser runs the game loop, collision detection, canvas rendering and controls in `static/game.js`. Go templates render HTML; they do not animate a canvas, so JavaScript is needed for interactive client-side play.

Best rally is saved in the browser using `localStorage` when available. There is no backend database.
