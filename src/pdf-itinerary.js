/* FICX itinerary document. Receives a snapshot; never reads browser storage or fetches assets. */
((root) => {
  "use strict";
  const bundledLogo = /* __PDF_LOGO__ */ "";
  const bundledFonts = /* __PDF_FONTS__ */ {};
  const clean = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim();

  function create(model, dependencies = {}) {
    if (!model.events?.length) throw new Error("No hay pases en el itinerario.");
    const PDF = dependencies.jsPDF || root.jspdf?.jsPDF;
    if (!PDF) throw new Error("El generador PDF no está disponible.");
    const fonts = dependencies.fonts || bundledFonts;
    const logo = dependencies.logo || bundledLogo;
    if (!logo) throw new Error("Falta el logo del documento.");
    const doc = new PDF({ unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
    for (const [file, family, style] of [
      ["Barlow-Regular.ttf", "Barlow", "normal"],
      ["Barlow-SemiBold.ttf", "Barlow", "bold"],
      ["BarlowCondensed-SemiBold.ttf", "BarlowCondensed", "normal"],
    ]) {
      if (!fonts[file]) throw new Error("Faltan las fuentes del documento.");
      doc.addFileToVFS(file, fonts[file]);
      doc.addFont(file, family, style);
    }
    const documentTitle = model.alias ? `El itinerario de ${clean(model.alias).replace(/\s+/g, " ")}` : "Tu itinerario";
    doc.setProperties({ title: `FICX 64 · ${documentTitle}`, subject: "Programa personal del festival", author: "FICX 64", creator: "FICX 64 · generador local" });
    const colors = { ink: [18, 29, 41], muted: [78, 92, 105], blue: [7, 83, 220], teal: [0, 115, 105], line: [215, 224, 230], warning: [145, 62, 20], warningBg: [255, 243, 227] };
    const left = 16, right = 194, bottom = 271, contentX = 47, contentWidth = right - contentX;
    let y = 0;
    const events = [...model.events].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    const days = [...new Set(events.map((event) => event.date))];
    const generated = new Date(model.generatedAt || Date.now());
    doc.setCreationDate(generated);
    const generatedLabel = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(generated);
    const dateLabel = (date, options) => new Intl.DateTimeFormat("es-ES", options).format(new Date(`${date}T12:00:00`));
    const font = (size = 10, weight = "normal", color = "ink") => {
      doc.setFont(weight === "display" ? "BarlowCondensed" : "Barlow", weight === "bold" ? "bold" : "normal");
      doc.setFontSize(size); doc.setTextColor(...colors[color]);
    };
    function rule(x, yy, width, color = "line", thickness = .3) {
      doc.setDrawColor(...colors[color]); doc.setLineWidth(thickness); doc.line(x, yy, x + width, yy);
    }
    function masthead(first) {
      doc.addImage(logo, "PNG", left, 11, 13, 13, "ficx-mark", "FAST");
      font(13, "bold"); doc.text("FICX 64", 33, 20);
      font(8, "bold", "muted"); doc.text("PROGRAMA PERSONAL", right, 20, { align: "right" });
      rule(left, 27, right - left);
      if (first) {
        const title = documentTitle;
        let size = 28;
        font(size, "display");
        while (doc.getTextWidth(title) > right - left && size > 24) font(--size, "display");
        const lines = doc.splitTextToSize(title, right - left);
        lines.forEach((line, index) => doc.text(line, left, 36 + index * 9));
        const summaryY = 44 + (lines.length - 1) * 9;
        font(8.5, "normal", "muted");
        const range = days.length === 1 ? dateLabel(days[0], { day: "numeric", month: "long" })
          : `${dateLabel(days[0], { day: "numeric", month: "short" })} — ${dateLabel(days.at(-1), { day: "numeric", month: "short" })}`;
        doc.text(`${events.length} ${events.length === 1 ? "pase" : "pases"}  /  ${days.length} ${days.length === 1 ? "día" : "días"}  /  ${range}`, left, summaryY);
        doc.text(clean(model.transportLabel || "Traslados estimados"), right, summaryY, { align: "right" });
        rule(left, summaryY + 5, right - left, "blue", .7);
        y = summaryY + 10;
      } else y = 34;
    }
    function dayHeader(date, continuation = false) {
      const count = events.filter((event) => event.date === date).length;
      font(23, "display", "blue"); doc.text(dateLabel(date, { day: "2-digit" }), left, y + 7);
      font(8, "bold"); doc.text(dateLabel(date, { weekday: "long" }).toLocaleUpperCase("es"), 29, y + 1);
      font(9); doc.text(`${dateLabel(date, { month: "long", year: "numeric" })}${continuation ? " · continuación" : ""}`, 29, y + 6);
      font(8.5, "normal", "muted"); doc.text(`${count} ${count === 1 ? "pase" : "pases"}`, right, y + 6, { align: "right" });
      rule(left, y + 9, right - left);
      y += 14;
    }
    function nextPage(date) {
      doc.addPage(); masthead(false); dayHeader(date, true);
    }
    function eventLines(event) {
      const lines = [];
      function paragraph(text, size, weight, color, height, gap = .7, badge = false) {
        if (!clean(text)) return;
        font(size, weight, color);
        const wrapped = doc.splitTextToSize(clean(text), contentWidth - (badge ? 8 : color === "warning" ? 5 : 0));
        wrapped.forEach((text) => lines.push({ text, size, weight, color, height, badge }));
        lines.push({ gap });
      }
      font(15.5, "display");
      const titleLines = doc.splitTextToSize(clean(event.title), contentWidth - (event.duration ? 26 : 0));
      titleLines.forEach((text, index) => lines.push({ text, size: 15.5, weight: "display", color: "ink", height: 5.2, duration: index === 0 ? event.duration : "" }));
      lines.push({ gap: .6 });
      if (event.films?.length) paragraph(`${event.filmsLabel ? event.filmsLabel + ": " : ""}${event.films.join(" · ")}`, 9, "normal", "muted", 3.9);
      paragraph([event.venue, ...(event.sections || [])].filter(Boolean).join(" · "), 9, "normal", "ink", 3.9);
      paragraph(event.details?.join(" · "), 8.2, "normal", "muted", 3.6);
      if (event.meeting) {
        paragraph("ENCUENTRO CON EL EQUIPO", 8, "bold", "teal", 5.1, .6, true);
      }
      for (const warning of event.warnings || []) paragraph(`Atención: ${warning}`, 8.2, "bold", "warning", 4, .7);
      if (event.transition) paragraph(event.transition, 8.2, "normal", event.transitionWarning ? "warning" : "teal", 3.8, 0);
      while (lines.length && lines.at(-1).gap !== undefined) lines.pop();
      return lines;
    }
    function eventBlock(event, date) {
      const lines = eventLines(event);
      const total = lines.reduce((sum, line) => sum + (line.gap ?? line.height), 0) + 6;
      if (y + Math.min(total, 50) > bottom || (total <= 120 && y + total > bottom)) nextPage(date);
      let cursor = 0, continuation = false;
      while (cursor < lines.length) {
        const top = y;
        font(15, "display"); doc.text(clean(event.time), left, top + 4);
        font(8, "normal", "muted");
        doc.text(continuation ? "continúa" : (event.end ? `hasta ${event.end.replace(" (+1 día)", "")}` : "fin por confirmar"), left, top + 8.5);
        if (!continuation && event.end?.includes("(+1 día)")) doc.text("(+1 día)", left, top + 12);
        doc.setFillColor(...colors.teal); doc.circle(40, top + 1, .95, "F");
        let baseline = top + 4;
        let rendered = 0;
        while (cursor < lines.length) {
          const line = lines[cursor];
          const height = line.gap ?? line.height;
          if (baseline + height > bottom - 3) break;
          if (line.gap !== undefined) { baseline += line.gap; cursor++; continue; }
          if (line.color === "warning") {
            doc.setFillColor(...colors.warningBg); doc.rect(contentX - 1.5, baseline - 3, contentWidth + 1.5, line.height + .2, "F");
          }
          font(line.size, line.weight, line.color);
          if (line.badge) {
            doc.setFillColor(230, 246, 242); doc.roundedRect(contentX - 1, baseline - 3.2, doc.getTextWidth(line.text) + 9, 5.3, 1, 1, "F");
            doc.setDrawColor(...colors.teal); doc.setLineWidth(.3);
            doc.roundedRect(contentX + 1, baseline - 2.2, 1.3, 2.3, .6, .6, "S");
            doc.line(contentX + .4, baseline - .7, contentX + .4, baseline + .5);
            doc.line(contentX + .4, baseline + .5, contentX + 2.9, baseline + .5);
            doc.line(contentX + 2.9, baseline + .5, contentX + 2.9, baseline - .7);
            doc.line(contentX + 1.65, baseline + .5, contentX + 1.65, baseline + 1.2);
          }
          doc.text(line.text, contentX + (line.badge ? 6 : 0), baseline);
          if (line.duration) { font(8.2, "normal", "muted"); doc.text(line.duration, right, baseline, { align: "right" }); }
          baseline += height; cursor++; rendered++;
        }
        if (!rendered) throw new Error("No se ha podido paginar el itinerario.");
        doc.setDrawColor(...colors.line); doc.setLineWidth(.35); doc.line(40, top + 3, 40, Math.max(top + 10, baseline));
        y = Math.max(top + 13, baseline + 3.2);
        if (cursor < lines.length) { nextPage(date); continuation = true; }
      }
    }
    masthead(true);
    for (const date of days) {
      const dayEvents = events.filter((event) => event.date === date);
      const firstHeight = eventLines(dayEvents[0]).reduce((sum, line) => sum + (line.gap ?? line.height), 0) + 6;
      const minimumFirst = firstHeight <= 120 ? firstHeight : Math.min(firstHeight, 50);
      if (y + 14 + minimumFirst > bottom) { doc.addPage(); masthead(false); }
      dayHeader(date);
      for (const event of dayEvents) eventBlock(event, date);
      y += 3;
    }
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page); rule(left, 276, right - left);
      font(8, "normal", "muted");
      doc.text("Copia personal · Comprueba los cambios del festival antes de cada pase.", left, 280);
      doc.text("Horas de fin sin coloquio posterior · Traslados orientativos.", left, 284);
      doc.text(`Generado el ${generatedLabel}`, left, 288);
      font(9, "bold"); doc.text(`${page} / ${pages}`, right, 284, { align: "right" });
    }
    return doc.output("blob");
  }
  root.FICXItineraryPDF = Object.freeze({ create });
  if (typeof module === "object" && module.exports) module.exports = { create };
})(typeof globalThis !== "undefined" ? globalThis : window);
