(() => {
  "use strict";

  const dialog = document.createElement("dialog");
  dialog.id = "lottery";
  dialog.setAttribute("aria-labelledby", "lottery-title");
  dialog.innerHTML = `
    <div class="lottery-heading">
      <h2 id="lottery-title">Namen auslosen</h2>
      <button type="button" id="lottery-close">Schließen</button>
    </div>
    <p class="klein">Die Namensliste bleibt in diesem Browser-Tab und wird beim Neuladen gelöscht.</p>
    <fieldset id="lottery-controls" class="lottery-controls">
      <legend class="lottery-sr">Namensliste und Auslosung</legend>
      <div id="lottery-drop" class="lottery-drop">
        <p><strong>Namensdatei hierher ziehen</strong></p>
        <p class="klein">Excel (.xlsx), CSV oder TXT</p>
        <button type="button" id="lottery-pick">Datei auswählen</button>
        <input type="file" id="lottery-file" accept=".xlsx,.csv,.txt" hidden>
      </div>
      <label for="lottery-input">Namen eingeben</label>
      <textarea id="lottery-input" rows="3" placeholder="Ein Name pro Zeile"></textarea>
      <button type="button" id="lottery-add">Namen hinzufügen</button>
      <h3 id="lottery-roster-title">Namensliste</h3>
      <ul class="lottery-roster" id="lottery-roster" aria-labelledby="lottery-roster-title"></ul>
      <div class="lottery-draw">
        <label for="lottery-count">Anzahl</label>
        <select id="lottery-count"></select>
        <button class="primary" type="button" id="lottery-run">Auslosen</button>
      </div>
    </fieldset>
    <p class="klein lottery-status" id="lottery-status" role="status" aria-atomic="true"></p>
    <div id="lottery-animation" class="lottery-animation" hidden aria-hidden="true"><span>?</span><span>?</span><span>?</span></div>
    <section id="lottery-result" aria-labelledby="lottery-result-title" hidden>
      <h3 id="lottery-result-title">Gezogene Namen</h3>
      <p class="klein">Tippe auf eine Karte, um diesen Platz neu auszulosen.</p>
      <ol class="lottery-drawn" id="lottery-drawn"></ol>
    </section>`;
  document.body.append(dialog);

  const byId = (id) => document.getElementById(id);
  const controls = byId("lottery-controls");
  const count = byId("lottery-count");
  const drawButton = byId("lottery-run");
  const status = byId("lottery-status");
  const animation = byId("lottery-animation");
  const drawnList = byId("lottery-drawn");
  const fileInput = byId("lottery-file");
  const roster = [];
  let drawn = [];
  let working = false;
  let drawCount = 3;
  let chosenInput = null;

  function button(text, action, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (label) b.setAttribute("aria-label", label);
    b.addEventListener("click", action);
    return b;
  }

  function available() {
    return roster.filter((person) => !person.excluded);
  }

  function showSuggestions() {
    const container = byId("lottery-suggestions");
    if (!container) return;
    const input = byId("vorname");
    const names = container.querySelector(".lottery-suggestions-list");
    names.replaceChildren(...drawn.map((person) => button(person.name, () => {
      input.value = person.name;
      chosenInput = { input, person };
      input.form.elements.klasse.focus();
    })));
    container.hidden = !drawn.length;
    if (chosenInput?.input === input && !drawn.includes(chosenInput.person)) {
      if (input.value === chosenInput.person.name) input.value = "";
      chosenInput = null;
    }
  }

  function renderDrawn(animate = false) {
    drawnList.replaceChildren(...drawn.map((person, index) => {
      const li = document.createElement("li");
      if (animate) {
        li.className = "lottery-reveal";
        li.style.animationDelay = Math.min(index, 5) * 85 + "ms";
      }
      const card = button(person.name, () => redraw(index), person.name + " neu auslosen");
      card.disabled = working;
      li.append(card);
      return li;
    }));
    byId("lottery-result").hidden = !drawn.length;
    showSuggestions();
  }

  function refreshRoster(restoreFocus) {
    const list = byId("lottery-roster");
    list.replaceChildren(...roster.map((person) => {
      const li = document.createElement("li");
      li.className = "lottery-person" + (person.excluded ? " lottery-excluded" : "");
      const name = document.createElement("strong");
      name.textContent = person.name;
      const actions = document.createElement("div");
      const toggleLabel = person.excluded ? "Einbeziehen" : "Ausschließen";
      const toggle = button(toggleLabel, () => {
        person.excluded = !person.excluded;
        if (person.excluded) drawn = drawn.filter((p) => p !== person);
        refreshRoster(person);
        status.textContent = person.name + (person.excluded ? " ist ausgeschlossen." : " nimmt wieder teil.");
      }, person.name + " " + toggleLabel.toLowerCase());
      actions.append(toggle, button("Entfernen", () => {
        roster.splice(roster.indexOf(person), 1);
        drawn = drawn.filter((p) => p !== person);
        refreshRoster();
        byId("lottery-input").focus();
        status.textContent = person.name + " wurde entfernt.";
      }, person.name + " entfernen"));
      li.append(name, actions);
      if (restoreFocus === person) li.dataset.restore = "true";
      return li;
    }));
    if (restoreFocus) list.querySelector("[data-restore] button")?.focus();
    const max = available().length;
    byId("lottery-roster-title").textContent = "Namensliste · " + max + " von " + roster.length + " nehmen teil";
    count.replaceChildren(...Array.from({length: Math.max(1, max)}, (_, i) => {
      const option = document.createElement("option");
      option.value = max ? String(i + 1) : "0";
      option.textContent = option.value;
      return option;
    }));
    count.value = String(Math.min(drawCount, max));
    count.disabled = !max;
    drawButton.disabled = !max;
    renderDrawn();
  }

  function addNames(names) {
    const unique = new Set(roster.map((person) => person.name.toLocaleLowerCase("de")));
    let added = 0;
    for (const raw of names) {
      const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
      const key = name.toLocaleLowerCase("de");
      if (!name || name.length > 100 || !/\p{L}/u.test(name) || unique.has(key)) continue;
      unique.add(key);
      roster.push({name, excluded: false});
      added++;
    }
    refreshRoster();
    status.textContent = added ? (added === 1 ? "1 Name hinzugefügt." : added + " Namen hinzugefügt.") :
      "Keine neuen Namen gefunden. Prüfe, ob die Liste Namen enthält, die noch nicht erfasst sind.";
    return added;
  }

  function randomNames(pool, n) {
    const shuffled = [...pool];
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (shuffled.length - i));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n);
  }

  function reveal(result, focusIndex = 0) {
    working = true;
    controls.disabled = true;
    for (const card of drawnList.querySelectorAll("button")) card.disabled = true;
    status.textContent = "Die Namenskarten werden gemischt …";
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    animation.hidden = reducedMotion;
    setTimeout(() => {
      drawn = result;
      working = false;
      controls.disabled = false;
      animation.hidden = true;
      renderDrawn(true);
      status.textContent = drawn.length === 1 ? "1 Name ausgelost." : drawn.length + " Namen ausgelost.";
      if (dialog.open) drawnList.querySelectorAll("button")[focusIndex]?.focus();
    }, reducedMotion ? 0 : 3100);
  }

  function redraw(index) {
    if (working) return;
    const candidates = available().filter((person) => !drawn.includes(person));
    if (!candidates.length) {
      status.textContent = "Zum Nachlosen brauchst du einen weiteren verfügbaren Namen.";
      return;
    }
    if (!window.confirm("Diesen Namen neu auslosen?")) return;
    const result = [...drawn];
    [result[index]] = randomNames(candidates, 1);
    reveal(result, index);
  }

  function parseDelimited(text, separator) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    const endRow = () => { rows.push([...row, cell]); row = []; cell = ""; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"' && (quoted || cell === "")) quoted = !quoted;
      else if (!quoted && c === separator) { row.push(cell); cell = ""; }
      else if (!quoted && (c === "\n" || c === "\r")) {
        endRow();
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else cell += c;
    }
    if (row.length || cell) endRow();
    return rows;
  }

  const firstHeaders = new Set(["vorname", "vornamen", "firstname", "givenname"]);
  const lastHeaders = new Set(["nachname", "familienname", "lastname", "surname"]);
  const fullHeaders = new Set(["name", "namen", "vollständigername", "vollername", "fullname", "schülername", "schülernamen", "schüler", "schülerin", "vorundnachname", "vornamenachname", "vornameundnachname"]);
  function namesFromRows(rows) {
    const populated = rows.filter((row) => row.some((v) => v?.trim()));
    const fields = populated.slice(0, 8).map((row) => row.map((v) =>
      (v || "").toLocaleLowerCase("de").replace(/[^\p{L}]/gu, "")
    ));
    const headerIndex = fields.findIndex((row) => row.some((v) => firstHeaders.has(v) || lastHeaders.has(v) || fullHeaders.has(v)));
    if (headerIndex >= 0) {
      const head = fields[headerIndex];
      const first = head.findIndex((v) => firstHeaders.has(v));
      const last = head.findIndex((v) => lastHeaders.has(v));
      const full = head.findIndex((v) => fullHeaders.has(v));
      return populated.slice(headerIndex + 1).map((row) => {
        if (first >= 0) return [row[first], row[last >= 0 ? last : full]].filter(Boolean).join(" ");
        return row[full >= 0 ? full : last] || "";
      });
    }
    return populated.map((row) => {
      const cells = row.filter((v) => v?.trim());
      const looksLikeName = (v) => /\p{L}/u.test(v) && !/[\d@]/.test(v);
      if (cells.length === 2 && cells.every(looksLikeName)) return cells.join(" ");
      return cells.find(looksLikeName) || "";
    });
  }

  async function textRows(file, extension) {
    const bytes = await file.arrayBuffer();
    const utf16 = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2));
    const encoding = utf16[0] === 255 && utf16[1] === 254 ? "utf-16le" :
      utf16[0] === 254 && utf16[1] === 255 ? "utf-16be" : "utf-8";
    let text;
    try { text = new TextDecoder(encoding, {fatal:true}).decode(bytes); }
    catch { text = new TextDecoder("windows-1252").decode(bytes); }
    const choices = extension === "csv" ? [";", "\t", ","] : ["\t", ";"];
    const candidates = choices.map((separator) => parseDelimited(text, separator));
    return candidates.reduce((best, rows) => rows.filter((row) => row.length > 1).length >
      best.filter((row) => row.length > 1).length ? rows : best);
  }

  function zipText(zip, path) {
    const entry = zip.file(path);
    if (!entry) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const stream = entry.internalStream("string");
      let xml = "", tooLarge = false;
      stream.on("data", (part) => {
        xml += part;
        if (xml.length > 5000000) {
          tooLarge = true;
          stream.pause();
          reject(new Error("Die Excel-Tabelle ist zu groß."));
        }
      });
      stream.on("error", reject);
      stream.on("end", () => { if (!tooLarge) resolve(xml); });
      stream.resume();
    });
  }

  async function excelRows(file) {
    if (typeof JSZip === "undefined") throw new Error("Der Excel-Import ist gerade nicht verfügbar. Verwende CSV oder TXT.");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const parser = new DOMParser();
    const read = async (path) => {
      const xml = await zipText(zip, path);
      if (!xml) return null;
      const doc = parser.parseFromString(xml, "application/xml");
      if (doc.querySelector("parsererror")) throw new Error("Die Excel-Datei konnte nicht gelesen werden.");
      return doc;
    };
    const elements = (node, tag) => Array.from(node?.getElementsByTagNameNS("*", tag) || []);
    const string = (node) => elements(node, "t").map((t) => t.textContent).join("");
    const [workbook, relations, strings] = await Promise.all(
      ["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml"].map(read)
    );
    const sheet = elements(workbook, "sheet").find((item) => !["hidden", "veryHidden"].includes(item.getAttribute("state")));
    const relId = sheet?.getAttribute("r:id") || sheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = elements(relations, "Relationship").find((item) => item.getAttribute("Id") === relId);
    const target = rel?.getAttribute("Target");
    const path = target ? (target.startsWith("/") ? target.slice(1) : "xl/" + target) : "xl/worksheets/sheet1.xml";
    const worksheet = await read(path);
    if (!worksheet) throw new Error("In der Excel-Datei wurde kein Tabellenblatt gefunden.");
    const shared = elements(strings, "si").map(string);
    return elements(worksheet, "row").map((row) => {
      const cells = [];
      for (const cell of elements(row, "c")) {
        const column = cell.getAttribute("r")?.match(/^[A-Z]+/)?.[0];
        const index = column ? [...column].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1 : cells.length;
        const type = cell.getAttribute("t");
        const value = elements(cell, "v")[0]?.textContent || "";
        cells[index] = type === "s" ? (shared[Number(value)] || "") : type === "inlineStr" ? string(cell) : value;
      }
      return cells;
    });
  }

  async function readFile(file) {
    if (!file || working) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (!["xlsx", "csv", "txt"].includes(extension)) {
      status.textContent = "Bitte wähle eine .xlsx-, .csv- oder .txt-Datei.";
      return;
    }
    if (file.size > 4000000) {
      status.textContent = "Wähle eine Namensdatei mit höchstens 4 MB.";
      return;
    }
    working = true;
    controls.disabled = true;
    for (const card of drawnList.querySelectorAll("button")) card.disabled = true;
    status.textContent = "Die Namensliste wird eingelesen …";
    try {
      const rows = await (extension === "xlsx" ? excelRows(file) : textRows(file, extension));
      addNames(namesFromRows(rows));
    } catch (error) {
      status.textContent = error instanceof Error && /^Die Excel-|^In der Excel-|^Der Excel-/.test(error.message) ?
        error.message : "Die Datei konnte nicht gelesen werden. Prüfe das Dateiformat.";
    } finally {
      working = false;
      controls.disabled = false;
      fileInput.value = "";
      renderDrawn();
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#lottery-open")) dialog.showModal();
  });
  byId("lottery-close").addEventListener("click", () => dialog.close());
  byId("lottery-pick").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => readFile(fileInput.files[0]));
  const drop = byId("lottery-drop");
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("lottery-over");
  });
  drop.addEventListener("dragleave", (event) => {
    if (!drop.contains(event.relatedTarget)) drop.classList.remove("lottery-over");
  });
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("lottery-over");
    readFile(event.dataTransfer.files[0]);
  });
  const manual = byId("lottery-input");
  function addManual() {
    if (working) return;
    if (addNames(namesFromRows(manual.value.split(/\r\n?|\n/).map((line) => [line])))) manual.value = "";
    manual.focus();
  }
  byId("lottery-add").addEventListener("click", addManual);
  manual.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); addManual(); }
  });
  count.addEventListener("change", () => { drawCount = Number(count.value); });
  drawButton.addEventListener("click", () => {
    if (!working && Number(count.value)) reveal(randomNames(available(), Number(count.value)));
  });
  globalThis.nameLottery = {showSuggestions};
  refreshRoster();
})();
