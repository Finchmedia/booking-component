### Kurzfazit (Status Quo im Code)
* Die aktuelle Datenstruktur kennt **einzelne Buchungen** mit `start`, `end`, `status`, `eventTypeId`, `resourceId` usw., aber **keine Felder/Tabellen für Serien‑ oder Wiederholungsregeln** (z. B. RRULE, Series-ID, Ausnahmen).【F:src/component/schema.ts†L141-L208】
* Verfügbarkeiten werden **slotbasiert** über `daily_availability` mit `busySlots` pro Datum geführt; Buchungen markieren diese Slots bei Erstellung und lösen Hooks/Emails aus.【F:src/component/schema.ts†L125-L138】【F:src/component/public.ts†L331-L434】
* Verfügbarkeit wird **ausschließlich über belegte Slots** geprüft (`daily_availability`) und ist damit auf **konkrete Datums‑Slots** ausgelegt – das passt aktuell zu Einmal‑ bzw. Event‑Buchungen, nicht zu Serienlogik.【F:src/component/availability.ts†L1-L30】
* Schedules/Weekly Hours existieren für die **Verfügbarkeitslogik**, aber nicht als Wiederholungslogik für Buchungen.【F:src/component/schema.ts†L31-L66】【F:src/component/schedules.ts†L316-L398】
* Das System ist **hook‑basiert** (booking.created/confirmed/cancelled/…) und nutzt `ctx.scheduler.runAfter` für E‑Mails/Events.【F:src/component/hooks.ts†L10-L239】

**Fazit:** Es gibt aktuell **keine eingebaute Recurring‑Booking‑Logik**; alles basiert auf **einzelnen Buchungseinträgen + slotbasierter Verfügbarkeit**.【F:src/component/schema.ts†L141-L208】【F:src/component/public.ts†L331-L434】【F:src/component/availability.ts†L1-L30】

---

## Vorschlag: Wie man “Recurring Bookings” sauber einführen kann
Ich skizziere dir eine **architekturelle Roadmap**, die zu deinem vorhandenen Ansatz (slotbasiert, O(1) availability) passt und Convex‑typisch umsetzbar ist.

### 1) Datenmodell‑Erweiterung (Series/Recurrence)
**Ziel:** Serienbuchungen darstellen, ohne das bestehende `bookings`‑Schema zu sprengen.

**Empfehlung:**
1. **Neue Tabelle** `recurrence_series`  
   * `id`, `resourceId`, `eventTypeId`, `organizationId`, `timezone`
   * `rule` (z. B. RRULE oder eigenes Schema: freq, interval, byDay, byMonth, count, until)
   * `anchorStart`, `anchorEnd` (erste Buchung)
   * `status` (active/paused/cancelled)
   * `createdAt`, `updatedAt`
2. **Optionale Tabelle** `recurrence_exceptions`  
   * `seriesId`, `date`, `type` (“skip”, “override”)
   * bei “override”: custom start/end oder Ressource/Location‑Override

**Warum?**  
Die bestehenden `bookings` bleiben **Instanzen**. Die Series‑Tabelle ist die **Quelle der Wahrheit** für die Regel. Das verhindert “alles in den bookings zu packen”.

### 2) Wie du Instanzen erzeugst (Materialisierung)
Es gibt zwei gängige Modelle:

#### Modell A — **Pre‑Materialisierung (empfohlen für O(1) Availability)**
* Beim Anlegen einer Serie werden **nächste X Wochen/Monate** sofort als **Einzelbuchungen** erzeugt.
* Für jedes Vorkommen werden:
  * `bookings` angelegt  
  * `daily_availability` aktualisiert  
* Ein **Convex Scheduler** Job erzeugt periodisch weitere Vorkommen (z. B. Roll‑Forward alle 14 Tage).

**Pro:**  
* availability bleibt einfach: `daily_availability` + Slots funktionieren wie bisher.【F:src/component/public.ts†L331-L434】【F:src/component/availability.ts†L1-L30】
* UI/Slots brauchen keine Recurrence‑Sonderlogik.

**Contra:**  
* Man muss mehr Einträge speichern und die “Window‑Breite” (z. B. 6 Monate) sorgfältig wählen.

#### Modell B — **Virtuelle Instanzen (on‑the‑fly)**
* `bookings` bleiben nur als “Serie‑Master”.
* Availability berechnet kombinierte Slots aus:
  * vorhandenen `bookings`  
  * plus **virtuellen** Serieninstanzen (die per Query generiert werden).

**Pro:**  
* Weniger Daten  
**Contra:**  
* Availability wird komplexer und langsamer (bricht O(1)‑Versprechen).  
* Slot‑Locking/Presence wird schwieriger.

👉 **Empfehlung:** Modell A passt zum vorhandenen slot‑basierten Ansatz und zum vorhandenen `daily_availability`‑Design.【F:src/component/schema.ts†L125-L138】【F:src/component/public.ts†L331-L434】

---

## 3) Erstellung einer Series: Konflikt‑Handling
Beim Anlegen einer Serie solltest du:

1. **Serie‑Regel expandieren** (z. B. nächste 3–6 Monate).  
2. Für **jede Instanz** prüfen:
   * `daily_availability` & Busy Slots (wie `createBooking`).【F:src/component/public.ts†L331-L410】
3. **Wenn Konflikte existieren:**
   * Fail fast (ganzes Create blocken), oder
   * Partiell anlegen + Konfliktliste zurückgeben

**Tipp:**  
Die vorhandene `getRequiredSlots`‑Logik kann für alle Vorkommen wiederverwendet werden, um Slot‑Sets zu berechnen.【F:src/component/utils.ts†L167-L200】

---

## 4) Update/Cancel‑Logik für Serien
Du brauchst typische Szenarien:

| Aktion | Erwartetes Verhalten |
|---|---|
| Ein einzelnes Vorkommen verschieben | In `recurrence_exceptions` speichern (override) + altes Vorkommen canceln + neues booking anlegen |
| Serie stoppen ab Datum | Series auf `paused/cancelled` setzen, zukünftige Instances canceln (Status + daily_availability freigeben) |
| Serie ändern (regelupdate) | “Regel‑Reset”: alle zukünftigen Instances löschen + neue materialisieren |

Für das Freigeben von Slots kannst du die Logik aus `cancelReservation` wiederverwenden (Busy Slots entfernen).【F:src/component/public.ts†L465-L507】

---

## 5) Hook‑/Event‑Pipeline für Serien
Ihr habt bereits **Hooks & Email‑Automationen** – diese sollten bei Serien genauso greifen:  
* Bei Erstellung jeder Instance → `booking.created` Hook.  
* Bei Serien‑Cancel → pro Instance `booking.cancelled`.  
* Optional: eigener Hook `series.created/updated/cancelled`.

Hook‑System ist bereits modular vorhanden, damit lässt sich das problemlos erweitern.【F:src/component/hooks.ts†L10-L259】

---

## 6) Frontend / UX
Das UI zeigt aktuell **Slot‑basiertes Calendar‑Booking**. Für Recurring brauchst du:
* “Wiederholungs‑Dropdown” (wöchentlich, zweiwöchentlich, monatlich…)
* Optional: “Ende nach N Terminen / bis Datum”
* Konflikt‑Warnungen (bei Serienvalidierung)

Die React‑Komponenten sind aktuell auf **einmalige Slot‑Auswahl** ausgelegt; es gibt keine Recurring‑Inputs heute.【F:src/component/public.ts†L261-L435】

---

## 7) Spezielle Punkte für “Langzeitverträge” / Proberaum‑Szenario
Recurring im Studio‑Kontext ist oft **“fixer Slot jede Woche”**. Das hat Besonderheiten:

* **Zeitfenster‑Vorrang**: wenn ein langfristiger Vertrag läuft, sollte er “hohe Priorität” haben → Slots werden langfristig geblockt.  
* **Kündigungslogik**: bei Vertragskündigung müssen zukünftige Slots freigegeben werden.  
* **Sonderfälle**: Feiertage / Date Overrides können automatisch *skipped* oder *verlegt* werden (über `recurrence_exceptions` + Schedules).【F:src/component/schedules.ts†L316-L398】

---

## 8) Convex‑spezifisch (ohne extra Skills)
In diesem Repo ist keine spezielle Convex‑Skill hinterlegt; daher habe ich keine Skill‑Anleitung angewendet.  
Convex‑typisch würde man:

* Serieninstanzen über **Scheduler Jobs** nachziehen  
* “Rolling Window” materialisieren (z. B. immer 90 Tage im Voraus)
* Hooks/Mails weiter nutzen (bestehende `ctx.scheduler.runAfter` bereits im Einsatz).【F:src/component/hooks.ts†L122-L239】

---

# Konkreter Umsetzungsplan (minimal‑invasiv)
**Phase 1 – Datenmodell + API**
1. `recurrence_series` + `recurrence_exceptions` Tabellen
2. API: `createRecurringBooking`, `cancelRecurringBooking`, `updateRecurringBooking`

**Phase 2 – Materialisierung**
3. Serien‑Create: expandiere Regel, prüfe Konflikte, materialisiere Vorkommen als normale `bookings`
4. Scheduler‑Job: alle X Tage weitere Vorkommen erzeugen

**Phase 3 – UI**
5. Wiederholungs‑UI im Booker  
6. Konflikt/Override‑Dialog

---

## Offene Fragen (falls du tiefer einsteigen willst)
* **Wie viele Monate** im Voraus sollen Recurring‑Slots blockiert werden?  
* **Prioritäten**: Dürfen einmalige Buchungen Serien überschreiben?  
* **Pricing / Verträge**: Wird pro Series bezahlt, oder pro Booking?  

---

## Testing
Nicht durchgeführt (Analyse/Review only).

---

Wenn du möchtest, kann ich dir im nächsten Schritt eine **konkrete Recurrence‑API‑Skizze** mit Feldern/Typen und Beispiel‑Payloads ausarbeiten (ohne Code‑Changes), oder eine **Risikoanalyse** für Markteinführung + UX (z. B. Konflikt‑UX, Kündigungslogik, Payment‑Flow).
