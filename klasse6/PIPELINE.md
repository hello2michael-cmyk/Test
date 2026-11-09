# Video-Pipeline für Klasse-6-Lektionen (Plan → Review → 3D → Gegen-Review → Korrektur → YouTube)

Ziel: Aus jedem Lernbereich des geprüften Lehrplans (`klasse6/data/klasse6-bayern.json`) wird ein
YouTube-Video mit 3D-Erklärungen, das Kinder der 6. Klasse verstehen. Die Produktion läuft als
Agenten-Team in der vorhandenen Video-Fabrik (`factory/run.mjs`, `studio/js/agents.js`), erweitert um
einen Lehrplan-Planer, einen zweiten, unabhängigen Prüf-Agenten auf einem anderen Modell und eine
Korrekturschleife. Jede Szene dauert mindestens 10 Sekunden (harte Untergrenze 8 Sekunden), damit
Kinder dem Bild folgen können.

## Rollen

| Rolle | Modell (Vorschlag) | Aufgabe | Ausgabe |
|---|---|---|---|
| Lehrplan-Planer | Qwen2.5-72B (HF Inference Providers) | Nimmt Lernbereich-ID (z. B. `M6-2.2`), liest Kompetenzen, Inhalte, Stundenzahl und kidExplanation aus dem Syllabus; plant Kapitel, Lernziele, Beispiele aus der Lebenswelt eines 11-jährigen Kindes in Bayern | `plan.json` (Kapitel, Ziele, Beispiele, geplante 3D-Szenen) |
| Plan-Prüfer | anderes Modell, z. B. Llama-3.3-70B oder DeepSeek-V3 | Prüft den Plan gegen den Lehrplan: Vollständigkeit, Reihenfolge (Grundvorstellung vor Regel), Alter, Fachsprache Bayern (z. B. „Grundwert“, „Hauptnenner“); fordert Nachbesserung an | `plan-review.json` (Befunde, blockierend/nicht) |
| Didaktik-Designer | Qwen2.5-72B | Schreibt pro Szene Sprechertext (≥ 32 Wörter, damit ≥ 10 s) und wählt die 3D-Szene mit Parametern aus `klasse6/js/mathscenes.js` (z. B. `volume` mit a=4, b=3, c=2) oder eine Szene aus `studio/js/scene3d.js`; legt Einblendungen fest | `script.json` |
| Renderer (Code) | – | Rendert die Szenen deterministisch (`engine3d.js` ist in Browser und Headless-Browser identisch), Stimme (Kokoro, später deutsche Stimme), Untertitel, H.264 | `video.mp4`, `captions.srt`, Standbilder je Szene |
| Gegen-Prüfer | anderes Modell als der Designer, mit Bild-Eingabe (z. B. Qwen2.5-VL-72B oder Llama-3.2-Vision) | Bekommt Sprechertext + Standbilder jeder Szene: Stimmt das Bild zur Aussage? Sind Zahlen, Beschriftungen, Formeln korrekt? Ist die Sprache kindgerecht? Dauer ≥ 10 s? | `review.json` mit Befunden pro Szene |
| Korrektur | Designer-Modell | Behebt jeden Befund (Text ändern, Parameter ändern, Szene tauschen, Szene verlängern); maximal 3 Runden, dann wird der Rest als „Vor Veröffentlichung prüfen“ an den Menschen gegeben | neues `script.json` |
| Publisher | Qwen2.5-72B | Titel, Beschreibung mit Kapitelmarken, Tags, Thumbnail-Text, Pinned Comment; verweist auf den Lernbereich | `youtube.txt` |

## Ablauf

1. **Auftrag**: Issue-Titel `Lektion: M6-2.2` (oder Actions-Formular). Optional im Text: `minuten: 7`, `stimme: de-DE-Chirp3-HD-Charon`.
2. **Plan** (3–6 Min.): Planer schreibt den Plan, Plan-Prüfer kommentiert, Planer bessert nach (max. 2 Runden). Der Plan wird als Kommentar auf dem Issue gepostet, Szene für Szene, mit der gewählten 3D-Szene und ihren Parametern.
3. **Freigabe**: Mensch antwortet `approve` oder mit Änderungswünschen (wie heute im Factory-Workflow).
4. **Produktion** (20–40 Min.): Designer-Skript → Render → Gegen-Prüfer mit Standbildern → Korrekturschleife → finaler Render.
5. **Veröffentlichung**: Release mit MP4, SRT, youtube.txt, Thumbnail; Kommentar mit Links. Upload über den bestehenden YouTube-Token in der Umgebung (`www.googleapis.com`) als späterer Schritt.

## Qualitätsregeln (werden vom Gegen-Prüfer geprüft)

- Jede Szene ≥ 10 s Sprechzeit (Untergrenze 8 s), keine Szene > 45 s; mindestens zwei 3D-Szenen pro Kapitel.
- Zuerst die Vorstellung (Pizza, Würfel, Streifen), dann die Regel, dann ein Beispiel mit Zahlen, dann eine Frage an das Kind.
- Deutsch, kurze Sätze, keine Abkürzungen, Fachbegriffe wie im bayerischen Lehrplan; Zahlen mit Komma („0,25“).
- Jede Zahl im Bild muss zum Sprechertext passen (der Prüfer rechnet nach).
- Kein Inhalt außerhalb des Lernbereichs, außer als kurzer Ausblick mit Hinweis „kommt später“.

## So läuft es jetzt: Claude schreibt in Claude Code, die Fabrik rendert

Der Besitzer hat ein Claude-Abo, aber keinen API-Schlüssel. Darum findet das Schreiben und Prüfen in Claude-Code-Sitzungen statt, und die
Fabrik auf GitHub Actions braucht kein Sprachmodell mehr:

1. **Autor (Claude in Claude Code)**: schreibt `klasse6/lessons/<ID>.lesson.json` aus dem Lehrplan-Thema: Kapitel, Szenen mit deutschem
   Sprechertext (≥ 32 Wörter), Titel, Stichpunkte, 3D-Szenen mit Parametern und `segment` (welcher Abschnitt der Animation zu sehen ist).
2. **Prüfer (zweites Claude-Modell, Sonnet-Subagent)**: rechnet jede Zahl nach, prüft Bild gegen Text je 3D-Szene, Lehrplan-Rahmen,
   Fachbegriffe, Kindersprache; blockierende Befunde gehen an den Autor zurück. Das Ergebnis steht im Feld `review` der Lektion.
3. **Generator** `klasse6/tools/make-plan.mjs`: erzeugt `klasse6/lessons/<ID>/plan.json` (das Format der Fabrik) und `plan.md`.
4. **Fabrik** (`Lektion: <ID>` als Issue): findet den eingecheckten Plan, rendert mit 3D-Szenen, Piper-Stimme, Untertiteln, Kapiteln,
   YouTube-Text; veröffentlicht als Release.

Ohne eingecheckten Plan läuft weiterhin der modellgestützte Weg (Hugging Face als Autor und zweiter Prüfer, Plan zur Freigabe auf dem Issue).

## Tempo und Mitdenken (Rückmeldung aus dem Test mit einer Sechstklässlerin)

Die erste Fassung war zu schnell. Seitdem gilt für Lektionen:

- **Stimme** etwas langsamer (Faktor 0,92) und längere Pausen zwischen Sätzen (0,5 s). Keine Hintergrundmusik: nur Stimme.
- **Nachhall**: jedes Bild bleibt 1,2 s stehen, nachdem der Sprecher fertig ist (`sceneHoldSeconds`).
- **Frage-Szenen** (`kind: "question"`): die Frage wird gesprochen und groß gezeigt, dann läuft ein sichtbarer Countdown
  (`think`, 8 bis 12 s), danach folgt die Antwort in der nächsten Szene. Jedes Kapitel hat mindestens eine Frage.
- **Mehr Beispiele**: jede Regel wird an zwei Beispielen gezeigt, bevor die Frage kommt.
- **Mehr Bilder**: Zahlengerade (`numberline`), Pizza-Vergleich (`compare`), Satzglieder-Blöcke (`sentence`) statt Textkarten.

## Zwei Videos je Thema

- **Kinder-Lektion** (`Lektion: <ID>`): für das Kind, Kennzeichnung „für Kinder“ auf YouTube (Kommentare aus, eingeschränkte Werbung).
- **Eltern-Lektion** (`Eltern: <ID>`, Datei `<ID>.eltern.lesson.json`): 8 bis 10 Minuten in Sie-Form für Eltern und Lehrkräfte, nicht
  für Kinder gekennzeichnet, mit Mid-Roll-Werbung ab 8 Minuten möglich. Aufbau: Lehrplan und Schulaufgabe, Kernideen in Bildern,
  typische Fehler, Üben zu Hause, Ausblick. Normales Sprechtempo, kürzerer Nachhall, keine Denkpausen.

## Was im Code läuft

- **Eingang** `Lektion: <Thema-ID>` als Issue-Titel oder Feld im Actions-Formular; Themen-IDs in `klasse6/LEKTIONEN.md`.
- **Eingecheckte Pläne** werden direkt gerendert (Workflow erkennt `klasse6/lessons/<ID>/plan.json`).
- **Szenenart `math3d`** mit Parametern und `segment`; aufeinanderfolgende Szenen ohne `segment` spielen eine durchgehende Animation.
- **Deutsche Stimme**: Google Cloud Text-to-Speech (Chirp 3 HD, 24 kHz; Standard `de-DE-Chirp3-HD-Leda` für die Kinder-Lektion,
  `de-DE-Chirp3-HD-Charon` für die Eltern-Lektion) im Fabrik-Prozess, sobald das
  Repository-Secret `GOOGLE_TTS_KEY` gesetzt ist; sonst und als Rückfall Piper (Thorsten, 22 kHz). Audiodaten per `__factoryTTS` in die Seite.
  English-Lektion: `en-US-Chirp3-HD-Charon` für den englischen Text und `de-DE-Chirp3-HD-Charon` für die Begriffe in «…» (derselbe
  Sprecher in beiden Sprachen; `TTS=google:<Stimme>+<Zweitstimme>`).
  Andere Stimme pro Video: Issue-Zeile `stimme: de-DE-Chirp3-HD-Charon` (oder `stimme: piper:de_DE-thorsten-high`). Synthese wird je Text
  zwischengespeichert, ein Neustart nach Absturz kostet nichts doppelt. Kosten: etwa 30 US-Dollar je Million Zeichen, eine Lektion hat rund
  6.000–10.000 Zeichen.
- **Mindestdauer** 10 s je Szene; Lektionen ohne Stock-Clips.
- Modellgestützter Weg (Fallback): Lehrplan-Brief aus dem Syllabus, Kinderregeln für alle Agenten, zweites Prüf-Modell mit Korrekturschleife.

## Noch offen

1. Bild-Prüfung der gerenderten Standbilder durch den Prüfer (heute: Text gegen Szenen-Parameter und Segment-Zeiten).
2. 3D-Szenen für Natur und Technik und Geschichte (Deutsch hat die Satzglieder-Szene `sentence`; Fremdsprachen folgen).
3. Deutsche Wortrate (2,5 Wörter/s) in der Zeitplanung des modellgestützten Wegs.
4. Automatischer YouTube-Upload über den Token in der Umgebung.
