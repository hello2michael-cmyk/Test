# Lektionen: die Video-Warteschlange für Klasse 6 (Bayern)

Jede Zeile ist ein YouTube-Video. Ablauf: (1) In Claude Code sagen „Plane Lektion M6-1.2“: Claude schreibt die Lektion auf
Deutsch, ein zweites Claude-Modell prüft sie, beides wird eingecheckt (`klasse6/lessons/`). (2) Ein Issue mit genau dem Titel
aus der Tabelle öffnen (zum Beispiel `Lektion: M6-1.1`): die Fabrik rendert den eingecheckten Plan mit 3D-Szenen und deutscher
Stimme (Google Cloud Text-to-Speech, Chirp 3 HD: Leda für Kinder, Charon für Eltern; ohne Schlüssel Piper/Thorsten) und postet
die Links. Spalte „Plan“: ✅ = geschrieben, geprüft und eingecheckt.

Zu jedem Thema gibt es zwei Videos: die **Kinder-Lektion** (`Lektion: <ID>`, langsam, du-Form, Fragen mit Denkpause,
Kennzeichnung „für Kinder“) und die **Eltern-Lektion** (`Eltern: <ID>`, 8 bis 10 Minuten, Sie-Form, für Eltern und
Lehrkräfte: Lehrplan, Kernideen, typische Fehler, Üben zu Hause, Schulaufgabe). Spalte „Eltern“: ✅ = eingecheckt.
Dazu kommt für ausgewählte Themen die **English-Lektion** (`English: <ID>`, auf Englisch für Eltern, die kein Deutsch sprechen;
die deutschen Fachbegriffe stehen in «…» und werden von der deutschen Stimme gesprochen, Glossar im Lehrplan-JSON).
Eingecheckt: M6-1.1, D6-4.2, NT6-1.2 und NT6-2.3 (`klasse6/lessons/<ID>/international/`).

## Schulaufgaben-Vorbereitung (`klasse6/schulaufgabe/`)

Für eine konkrete Schulaufgabe gibt es Vorbereitungs-Lektionen (`Lektion: M6-SA1.1` Brüche, `Lektion: M6-SA1.2` Dezimalbrüche;
je etwa 17 Minuten, Kinder-Variante, jede Frage im Schulaufgaben-Stil mit Denkpause) und dazu im Ordner `klasse6/schulaufgabe/`
drei Übungs-Schulaufgaben A/B/C (je 40 BE, mit Lösungen, PDF und Markdown) sowie einen Lernzettel (PDF, 3 Seiten).
Neue 3D-Szenen dafür: `primfaktor` (Primfaktorbaum, kgV = Hauptnenner), `division` (schriftliche Division mit Periodenstrich),
`zahlenmengen` (ℕ ⊂ ℤ ⊂ ℚ). PDFs entstehen mit `node klasse6/tools/make-pdf.mjs <datei.md>`.

Fertige Videos (GitHub-Releases, 90 Tage abrufbar; ohne Hintergrundmusik, mit Transparenzhinweis auf der Schlusskarte):

| Video | Stimme | Länge | Link |
|---|---|---|---|
| Kinder-Lektion M6-1.1 Brüche | Leda | ca. 13:30 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-30 |
| Kinder-Lektion D6-4.2 Satzglieder | Leda | ca. 13:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-31 |
| Eltern-Lektion M6-1.1 Brüche | Charon | ca. 10:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-32 |
| English-Lektion M6-1.1 Fractions | Charon (en-US + de-DE) | ca. 12:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-33 |
| Eltern-Lektion D6-4.2 Satzglieder | Charon | ca. 11:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-34 |
| English-Lektion D6-4.2 Sentence parts | Charon (en-US + de-DE) | ca. 13:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-35 |
| Kinder-Lektion NT6-1.2 Samen und Früchte | Leda | ca. 17:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-36 |
| Eltern-Lektion NT6-1.2 Samenpflanzen | Charon | ca. 11:30 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-37 |
| English-Lektion NT6-1.2 Seeds and fruits | Charon (en-US + de-DE) | ca. 13:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-38 |
| Kinder-Lektion NT6-2.3 Dateisystem | Leda | ca. 16:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-39 |
| Eltern-Lektion NT6-2.3 Informatik | Charon | ca. 11:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-40 |
| English-Lektion NT6-2.3 File system | Charon (en-US + de-DE) | ca. 12:30 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-41 |
| Kinder-Lektion E6-1.2 Simple past oder present perfect | Leda | ca. 16:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-42 |
| Eltern-Lektion E6-1.2 Englisch | Charon | ca. 11:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-43 |
| Kinder-Lektion F6-1.2 Verben im Präsens | Leda | ca. 16:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-44 |
| Eltern-Lektion F6-1.2 Französisch | Charon | ca. 11:30 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-45 |
| Kinder-Lektion G6-1 Der Mensch und seine Geschichte | Leda | ca. 18:30 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-46 |
| Eltern-Lektion G6-1 Geschichte | Charon | ca. 12:30 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-47 |
| Kinder-Lektion L6-2.2 Die Fälle | Leda | ca. 17:00 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-48 |
| Eltern-Lektion L6-2.2 Latein | Charon | ca. 11:30 | https://github.com/hello2michael-cmyk/Test/releases/tag/video-49 |
| Stimmvergleich Eltern M6-1.1 | Kore / Charon / Leda | ca. 10:00 | video-20 / video-21 / video-22 |

Reihenfolge: zuerst Mathematik (fertige 3D-Szenen), dann Deutsch (Satzglieder-Szene vorhanden), Natur und Technik, Geschichte, Fremdsprachen, dann der Rest.

## Mathematik (4 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: M6-1.1` | Bruchteile und Bruchzahlen | 13 | 15 | ✅ fraction, compare, numberline, percent | ✅ | ✅ |
| `Lektion: M6-1.2` | Dezimalbrüche | 11 | 6 | ✅ decimal | – | – |
| `Lektion: M6-1.3` | Addition und Subtraktion rationaler Zahlen | 15 | 7 | ✅ fracadd | – | – |
| `Lektion: M6-1.4` | Multiplikation und Division rationaler Zahlen | 14 | 7 | ✅ fracmul | – | – |
| `Lektion: M6-1.5` | Verbindung der Grundrechenarten bei rationalen Zahlen | 15 | 6 | ✅ terms | – | – |
| `Lektion: M6-2.1` | Flächeninhalt | 12 | 7 | ✅ area | – | – |
| `Lektion: M6-2.2` | Volumen | 12 | 7 | ✅ volume | – | – |
| `Lektion: M6-3` | Prozentrechnung, Daten und Diagramme | 20 | 8 | ✅ percent | – | – |

## Natur und Technik (3 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: NT6-1.1` | Erkenntnisse gewinnen – kommunizieren – bewerten | – | 5 | – | – | – |
| `Lektion: NT6-1.2` | Samenpflanzen als Lebewesen | 16 | 8 | ✅ seed | ✅ | ✅ |
| `Lektion: NT6-1.3` | Biodiversität bei Wirbeltieren – Variabilität und Angepasstheit | 26 | 9 | geplant: vertebrates | – | – |
| `Lektion: NT6-1.4` | Verwandtschaft der Wirbeltiere und Evolution | 8 | 6 | – | – | – |
| `Lektion: NT6-1.5` | Ökosystem Gewässer | 6 | 6 | – | – | – |
| `Lektion: NT6-2.1` | Informationsdarstellung mit Grafik-, Text- und Multimediadokumenten | 18 | 7 | geplant: objects | – | – |
| `Lektion: NT6-2.2` | Projekt: Erstellen einer Multimediapräsentation | 5 | 6 | – | – | – |
| `Lektion: NT6-2.3` | Hierarchische Informationsstrukturen – Dateisystem | 5 | 5 | ✅ filetree | ✅ | ✅ |

## Geschichte (2 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: G6-1` | Der Mensch und seine Geschichte | 6 | 6 | ✅ timeline | ✅ | ✅ |
| `Lektion: G6-2` | Ägypten – eine frühe Hochkultur | 6 | 7 | geplant: pyramid | – | – |
| `Lektion: G6-3` | Die griechische Antike | 10 | 8 | – | – | – |
| `Lektion: G6-4` | Menschen machen Geschichte | 6 | 6 | – | – | – |
| `Lektion: G6-5` | Das Imperium Romanum | 12 | 9 | geplant: empire | – | – |
| `Lektion: G6-6` | Von der Antike zum Mittelalter | 8 | 7 | – | – | – |
| `Lektion: G6-7` | Leben in der Familie | 6 | 5 | – | – | – |

## Deutsch (4 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: D6-1.1` | Verstehend zuhören | – | 5 | – | – | – |
| `Lektion: D6-1.2` | Zu und vor anderen sprechen | – | 5 | – | – | – |
| `Lektion: D6-1.3` | Mit anderen sprechen | – | 5 | – | – | – |
| `Lektion: D6-1.4` | Szenisch spielen | – | 5 | – | – | – |
| `Lektion: D6-2.1` | Lesetechniken und -strategien anwenden | – | 5 | – | – | – |
| `Lektion: D6-2.2` | Literarische Texte verstehen und nutzen | – | 5 | – | – | – |
| `Lektion: D6-2.3` | Pragmatische Texte verstehen und nutzen | – | 5 | – | – | – |
| `Lektion: D6-2.4` | Weitere Medien verstehen und nutzen | – | 5 | – | – | – |
| `Lektion: D6-3.1` | Über Schreibfertigkeiten verfügen | – | 5 | – | – | – |
| `Lektion: D6-3.2` | Texte planen und schreiben | – | 5 | – | – | – |
| `Lektion: D6-3.3` | Texte überarbeiten | – | 5 | – | – | – |
| `Lektion: D6-4.1` | Sprachliche Verständigung untersuchen | – | 5 | – | – | – |
| `Lektion: D6-4.2` | Sprachliche Strukturen untersuchen | – | 13 | ✅ sentence | ✅ | ✅ |
| `Lektion: D6-4.3` | Richtig schreiben | – | 5 | – | – | – |

## Englisch (1. Fremdsprache) (4 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: E6-1.1` | Kommunikative Fertigkeiten | – | 5 | – | – | – |
| `Lektion: E6-1.2` | Verfügen über sprachliche Mittel | – | 5 | ✅ tense | ✅ | ✅ |
| `Lektion: E6-2` | UK und USA | – | 5 | – | – | – |
| `Lektion: E6-3` | Texte und Medien | – | 5 | – | – | – |
| `Lektion: E6-4` | Lernstrategien | – | 5 | – | – | – |
| `Lektion: E6-5` | Themen der Jahrgangsstufe | – | 5 | – | – | – |

## Latein (2. Fremdsprache) (4 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: L6-1` | Lehrbuchtexte übersetzen | – | 5 | – | – | – |
| `Lektion: L6-2.1` | Wortschatz | – | 5 | – | – | – |
| `Lektion: L6-2.2` | Formenlehre | – | 5 | ✅ kasus | ✅ | ✅ |
| `Lektion: L6-2.3` | Satzlehre | – | 5 | – | – | – |
| `Lektion: L6-3` | Rom und seine Welt | – | 5 | – | – | – |
| `Lektion: L6-4` | Übersetzen und Lernen | – | 5 | – | – | – |

## Französisch (2. Fremdsprache) (4 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: F6-1.1` | Kommunikative Fertigkeiten | – | 5 | – | – | – |
| `Lektion: F6-1.2` | Verfügen über sprachliche Mittel | – | 5 | ✅ conjugaison | ✅ | ✅ |
| `Lektion: F6-2` | Frankreich kennenlernen | – | 5 | – | – | – |
| `Lektion: F6-3` | Texte und Medien | – | 5 | – | – | – |
| `Lektion: F6-4` | Lernstrategien | – | 5 | – | – | – |
| `Lektion: F6-5` | Themen der Jahrgangsstufe | – | 5 | – | – | – |

## Ethik (2 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: Eth6-1` | Judentum und Christentum | 14 | 6 | – | – | – |
| `Lektion: Eth6-2` | Umgang mit Medien | 10 | 6 | – | – | – |
| `Lektion: Eth6-3` | Dem Anderen begegnen | 14 | 6 | – | – | – |
| `Lektion: Eth6-4` | Konsum und Freizeit | 18 | 6 | – | – | – |

## Katholische / Evangelische Religionslehre (2 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: KR6-1` | Staunen und Nachdenken über Gottes Welt | 10 | 6 | – | – | – |
| `Lektion: KR6-2` | Zwischen Scheitern und Gelingen – Erfahrungen im Alten Testament | 12 | 6 | – | – | – |
| `Lektion: KR6-3` | Jesus Christus – Hoffnung in Leid und Tod | 12 | 6 | – | – | – |
| `Lektion: KR6-4` | Christliches Gemeindeleben: die Begeisterung des Anfangs | 12 | 6 | – | – | – |
| `Lektion: KR6-5` | Vielfalt der Kulturen und Lebenswelten – Solidarität im Namen Gottes | 10 | 6 | – | – | – |
| `Lektion: ER6-1` | In Beziehung | 12 | 6 | – | – | – |
| `Lektion: ER6-2` | Zwischen Galiläa und Jerusalem | 8 | 6 | – | – | – |
| `Lektion: ER6-3` | „Mitten unter euch“ – Jesu Botschaft und Leben | 16 | 6 | – | – | – |
| `Lektion: ER6-4` | Feste und Auszeiten | 10 | 6 | – | – | – |
| `Lektion: ER6-5` | Anders – fremd – verschieden | 10 | 6 | – | – | – |

## Kunst (2 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: Ku6-1` | Bildende Kunst | – | 6 | geplant: perspective | – | – |
| `Lektion: Ku6-2` | Architektur und Produktdesign | – | 5 | – | – | – |
| `Lektion: Ku6-3` | Schrift, Foto, Film | – | 5 | – | – | – |

## Musik (2 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: Mu6-1` | Sprechen – Singen – Musizieren | – | 5 | – | – | – |
| `Lektion: Mu6-2` | Komponisten und ihre Zeit | – | 5 | – | – | – |
| `Lektion: Mu6-3` | Bewegung – Tanz – Szene | – | 5 | – | – | – |
| `Lektion: Mu6-4` | Musik und ihre Grundlagen | – | 6 | geplant: intervals | – | – |

## Sport (Basissport) (2 Wochenstunden)

| Issue-Titel | Thema | Lehrplan-Std. | Video (min) | 3D-Szene | Plan | Eltern |
|---|---|---|---|---|---|---|
| `Lektion: S6-1` | Gesundheit und Fitness | – | 5 | – | – | – |
| `Lektion: S6-2` | Fairness und Kooperation | – | 5 | – | – | – |
| `Lektion: S6-3` | Freizeit und Umwelt | – | 5 | – | – | – |
| `Lektion: S6-4.1` | Leichtathletik | – | 5 | – | – | – |
| `Lektion: S6-4.2` | Schwimmen | – | 5 | – | – | – |
| `Lektion: S6-4.3` | Kleine Spiele und Sportspiele | – | 5 | – | – | – |
| `Lektion: S6-4.4` | Turnen und Bewegungskünste | – | 5 | – | – | – |
| `Lektion: S6-4.5` | Gymnastik und Tanz | – | 5 | – | – | – |

Gesamt: 84 Lektionen, etwa 475 Minuten Video.
