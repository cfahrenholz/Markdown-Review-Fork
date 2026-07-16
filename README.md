# Markdown Review

Markdown Review ist ein kleines lokales Review-Werkzeug fuer Markdown-Dateien. Es laeuft als Tauri-Desktop-App, zeigt den Text als Markdown, gerendert oder in einem einfachen Editor an und speichert Kommentare, Markierungen und Bearbeitungsstatus in einer Sidecar-Datei neben dem Original.

Das Tool ist fuer Autorinnen, Autoren und KI-Assistenten gedacht, die gemeinsam an Markdown-Texten arbeiten. Feedback bleibt damit nicht im Chat stecken, sondern liegt strukturiert neben der Datei.

## Voraussetzungen

- macOS auf Apple Silicon fuer das mitgelieferte App-Bundle
- Rust/Cargo nur fuer Entwicklung oder lokale Builds
- Funktioniert lokal und offline
- Fuer Betrieb unter Windows [siehe README.WINDOWS.md](README.WINDOWS.md)

## Installation

Release-Archiv entpacken und `Markdown Review.app` in den Programme-Ordner oder einen Projektordner legen.

Im Entwicklungsordner liegen die App-Oberflaeche und der Tauri-Host so:

```text
markdown-review/
  app/
    index.html
    app.js
    app.css
  markdown-review.sh
  build-mac.sh
  src-tauri/
  examples/
```

Markdown-Dateien koennen relativ oder absolut uebergeben werden.

## Start

Wenn ein gebautes Bundle in `dist/Markdown Review.app` liegt:

```bash
./markdown-review.sh "pfad/zur/datei.md"
```

Ohne Argument oeffnet die App einen Datei-Auswahldialog.

Im Entwicklungsmodus startet dasselbe Skript automatisch `cargo run`, solange noch kein Bundle in `dist/` liegt.

Direkt aus Tauri:

```bash
cargo run --manifest-path src-tauri/Cargo.toml -- "pfad/zur/datei.md"
```

Beispiele:

```bash
./markdown-review.sh "examples/sonnenfinsternis.md"
./markdown-review.sh "/Users/me/Documents/essay.md"
```

## Build

```bash
./build-mac.sh
```

Das Skript baut die Tauri-App fuer `aarch64-apple-darwin` und kopiert die `.app` nach `dist/`.

## Dateien

Fuer eine Markdown-Datei:

```text
kapitel.md
```

legt Markdown Review daneben eine Sidecar-Datei an:

```text
kapitel.md.feedback.json
```

Die Markdown-Datei bleibt normale, lesbare Markdown-Datei. Kommentare, Anker, Status und Iterationshistorie stehen in der Sidecar-Datei.

## Review-Ablauf

Issues haben drei Zustaende:

- `commented`: Feedback liegt vor und muss bearbeitet werden.
- `edited`: Der Text wurde redigiert und wartet auf Abnahme.
- `approved`: Die Aenderung wurde abgenommen.

Der normale Ablauf:

1. Eine Person markiert Text und schreibt einen Kommentar.
2. Autor, Autorin oder KI-Assistent redigiert die Markdown-Datei.
3. Die Sidecar-Datei wird aktualisiert: Status `edited`, kurze Erklaerung der Umsetzung, neuer Anker.
4. Die pruefende Person klickt entweder `Approve` oder gibt mit `Steer` weiteres Feedback.
5. `Steer` haengt einen neuen Kommentar an dasselbe Issue und setzt es wieder auf `commented`.

## Arbeit mit KI-Assistenten

Wenn ein KI-Assistent Feedback einarbeiten soll:

1. Die passende `.feedback.json` neben der Markdown-Datei lesen.
2. Alle Issues mit `status: "commented"` bearbeiten.
3. Die betroffene Stelle ueber `prefix + quote + suffix`, `startOffset` und `endOffset` suchen.
4. `startLine` und `endLine` nur als Orientierung verwenden, weil Zeilen sich verschieben koennen.
5. Wenn die Stelle nicht eindeutig auffindbar ist, nachfragen.
6. Nach der Bearbeitung:
   - `status` auf `edited` setzen
   - `resolution` mit einer kurzen Erklaerung fuellen
   - `applied` mit dem neuen Anker aktualisieren
   - im `thread` einen Eintrag mit `type: "redaction"` anhaengen

Nur die pruefende Person sollte Issues auf `approved` setzen.

## Issue-Thread

Ein Issue bildet eine kleine Historie:

```json
{
  "thread": [
    { "type": "comment", "createdBy": "reviewer", "body": "Initiales Feedback" },
    { "type": "redaction", "createdBy": "assistant", "body": "Was geaendert wurde" },
    { "type": "steer", "createdBy": "reviewer", "body": "Weitere Richtung" },
    { "type": "redaction", "createdBy": "assistant", "body": "Wie darauf reagiert wurde" }
  ]
}
```

Im UI sind Kommentare gelb und Redaktionsnotizen gruen.

## Anker

Kommentare koennen sich auf einzelne Woerter, Phrasen, Saetze, Absaetze oder mehrzeilige Bereiche beziehen.

Wichtige Felder:

- `quote`: ausgewaehlter Text
- `quotePreview`: kurze Anzeige der Auswahl
- `prefix` / `suffix`: Kontext vor und nach der Auswahl
- `startOffset` / `endOffset`: Positionen im Markdown zum Zeitpunkt der Auswahl
- `startLine` / `endLine`: Orientierung im Text
- `applied.newQuote`: Text nach der Bearbeitung
- `applied.newStartLine` / `applied.newEndLine`: Orientierung fuer die redigierte Stelle

## Bearbeiten-Modus

Der Modus **Bearbeiten** ist ein einfacher Markdown-Editor. Beim Wechsel in diesen Modus fuegt Markdown Review temporaere, sichtbare Marker um offene oder noch nicht abgenommene Issue-Anker ein:

```text
⟦rb:start:fb-123⟧markierter Text⟦rb:end:fb-123⟧
```

Diese Marker duerfen beim Schreiben verschoben werden. Beim Speichern oder Verlassen des Bearbeiten-Modus:

1. liest Markdown Review die Markerpositionen,
2. aktualisiert die Anker in der Sidecar-Datei,
3. entfernt alle Marker,
4. speichert wieder eine saubere `.md`-Datei.

Wenn Marker versehentlich geloescht werden, bleibt der vorherige Sidecar-Anker fuer dieses Issue erhalten.

## Hot Reload

Markdown-Datei und Sidecar-Datei werden per leichtem Polling beobachtet. Wenn ein externer Editor oder ein KI-Assistent eine der Dateien aendert, aktualisiert sich die App-Ansicht automatisch.

Im Bearbeiten-Modus pausiert Hot Reload, damit aktuelles Tippen nicht ueberschrieben wird.
