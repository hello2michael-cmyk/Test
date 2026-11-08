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

## Was im Code schon vorbereitet ist

- `klasse6/js/engine3d.js` und `klasse6/js/mathscenes.js`: deterministische 3D-Szenen für alle acht Mathematik-Lernbereiche mit Parametern und Schrittzeiten; sie lassen sich 1:1 im Studio-Renderer als neue Szenenart `math3d` einhängen (Zeichnen über `Scene.draw(S, t, params)`).
- `studio/js/timing.js`: die Mindestdauer einer Szene ist jetzt einstellbar (`minSceneSeconds` in den Einstellungen; Fabrik: Umgebungsvariable `MIN_SCENE_SECONDS`). Für Kinder-Lektionen wird 10 gesetzt.
- Syllabus-JSON mit `scene`- und `videoMinutes`-Feldern pro Thema als Eingabe für den Planer.

## Nächste Schritte

1. Szenenart `math3d` im Studio-Renderer registrieren und im Chapter-Writer-Prompt anbieten (Liste der Szenen und Parameter aus `mathscenes.js`).
2. Zweiten Prüf-Agenten mit anderem Modell und Bild-Eingabe in `agents.js` ergänzen (Standbilder je Szene aus dem Renderer).
3. Deutsche Stimme (z. B. Thorsten-Voice/Piper oder eine deutsche Kokoro-Stimme) im Studio einbauen.
4. Workflow-Eingang `Lektion:` neben `Video:` in `.github/workflows/video-factory.yml`.
5. Danach dieselbe Kette für Natur und Technik (Photosynthese, Wirbeltiere, Dateisystem-Baum) und Geschichte (Zeitleiste, Imperium Romanum).
