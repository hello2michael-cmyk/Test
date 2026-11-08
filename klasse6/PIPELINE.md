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

1. **Auftrag**: Issue-Titel `Lektion: M6-2.2` (oder Actions-Formular). Optional im Text: `minuten: 7`, `stimme: de`, `szenenminimum: 10`.
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

## Was im Code bereits läuft

- **Eingang** `Lektion: <Thema-ID>` als Issue-Titel oder Feld im Actions-Formular (`.github/workflows/video-factory.yml`); die Themen-IDs stehen in `klasse6/LEKTIONEN.md`.
- **Brief aus dem Lehrplan**: `factory/run.mjs` liest `klasse6/data/klasse6-bayern.json` und baut den deutschen Auftrag (Kompetenzen, Inhalte, Stunden, Grundidee); Stil `course`, keine Stock-Clips, Mindestdauer 10 s je Szene.
- **Agenten-Regeln für Kinder** (`studio/js/lesson.js`): Deutsch, du-Form, bayerische Fachbegriffe, Reihenfolge Bild → Regel → Beispiel → Frage, mindestens 32 Wörter je Szene.
- **Szenenart `math3d`**: der Kapitel-Autor wählt eine der acht Mathe-Szenen mit Parametern; aufeinanderfolgende Szenen mit gleicher Szene und gleichen Zahlen spielen eine durchgehende Animation (`studio/js/renderer.js`).
- **Zweites Prüf-Modell** (`REVIEWER`, Standard Llama 3.3 70B über Hugging Face) prüft Zahlen gegen die Szenen-Parameter, Lehrplan-Rahmen und Kindersprache; blockierende Befunde (`mustFix`) gehen an den Autor zurück, höchstens zwei Korrekturrunden; Rest landet in der Liste „vor Veröffentlichung prüfen“.
- **Deutsche Stimme**: Piper (Thorsten, 22 kHz) läuft im Fabrik-Prozess und reicht die Audiodaten in die Seite (`__factoryTTS`); Stimme per `TTS=piper:<voice>` wählbar.
- **Plan-Freigabe** auf dem Issue wie bisher (`approve` oder Änderungswünsche).

## Noch offen

1. Bild-Prüfung: Standbilder jeder Szene an ein Vision-Modell geben (prüft, ob das Bild zur Aussage passt). Heute prüft der zweite Prüfer den Text gegen die Szenen-Parameter.
2. 3D-Szenen für Natur und Technik (Photosynthese, Wirbeltiere, Dateisystem-Baum, Objekte und Klassen), Geschichte (Zeitleiste, Pyramide, Imperium Romanum), Deutsch/Englisch/Latein (Satzglieder, Zeitformen, Deklinationen).
3. Deutsche Wortrate für die Zeitplanung (Piper spricht etwa 2,5 Wörter/s statt 3,1): Längenabschätzung vor der Vertonung anpassen.
4. Automatischer YouTube-Upload über den Token in der Umgebung.
