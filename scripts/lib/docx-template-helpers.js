// scripts/lib/docx-template-helpers.js
//
// Shared XML-surgery helpers for the "template-by-injection" build scripts
// (build-tension-template.js / build-heaviness-template.js). They were
// byte-for-byte duplicates; extracted here so there is a single source of
// truth. Pure string functions, no I/O.

function findTopLevelChildren(xml, from, to) {
  const out = [];
  let i = from;
  while (i < to) {
    while (i < to && /\s/.test(xml[i])) i++;
    if (i >= to) break;
    if (xml[i] !== "<") {
      i++;
      continue;
    }
    const tagStart = i;
    let j = i + 1;
    while (j < to && !/[\s>\/]/.test(xml[j])) j++;
    const tagName = xml.substring(i + 1, j);
    while (j < to && xml[j] !== ">") j++;
    const isSelfClose = xml[j - 1] === "/";
    j++;
    if (isSelfClose) {
      out.push({ tag: tagName, start: tagStart, end: j });
      i = j;
      continue;
    }
    const closeTag = `</${tagName}>`;
    const openTag = `<${tagName} `;
    const openTagAlt = `<${tagName}>`;
    let depth = 1;
    let k = j;
    while (k < to && depth > 0) {
      const nextClose = xml.indexOf(closeTag, k);
      if (nextClose < 0) {
        depth = 0;
        k = to;
        break;
      }
      let scan = k;
      while (true) {
        const a = xml.indexOf(openTag, scan);
        const b = xml.indexOf(openTagAlt, scan);
        let next;
        if (a < 0 && b < 0) next = -1;
        else if (a < 0) next = b;
        else if (b < 0) next = a;
        else next = Math.min(a, b);
        if (next < 0 || next > nextClose) break;
        depth++;
        scan = next + openTag.length;
      }
      depth--;
      k = nextClose + closeTag.length;
    }
    out.push({ tag: tagName, start: tagStart, end: k });
    i = k;
  }
  return out;
}

function findRows(tableXml) {
  const out = [];
  for (const m of tableXml.matchAll(/<w:tr[ >]/g)) {
    const s = m.index;
    const e = tableXml.indexOf("</w:tr>", s);
    if (e < 0) continue;
    out.push({ start: s, end: e + "</w:tr>".length });
  }
  return out;
}

function findCells(rowXml) {
  const out = [];
  let i = 0;
  while (true) {
    const s = rowXml.indexOf("<w:tc>", i);
    if (s < 0) {
      const s2 = rowXml.indexOf("<w:tc ", i);
      if (s2 < 0) break;
      const e2 = closeTagEnd(rowXml, s2, "w:tc");
      out.push({ start: s2, end: e2 });
      i = e2;
      continue;
    }
    const e = closeTagEnd(rowXml, s, "w:tc");
    out.push({ start: s, end: e });
    i = e;
  }
  return out;
}

function closeTagEnd(xml, openStart, tagName) {
  const openTag1 = `<${tagName}>`;
  const openTag2 = `<${tagName} `;
  const closeTag = `</${tagName}>`;
  let depth = 1;
  const gt = xml.indexOf(">", openStart);
  let i = gt + 1;
  while (depth > 0) {
    const nextClose = xml.indexOf(closeTag, i);
    if (nextClose < 0) throw new Error(`Unbalanced ${tagName}`);
    let scan = i;
    while (true) {
      const a = xml.indexOf(openTag1, scan);
      const b = xml.indexOf(openTag2, scan);
      let next;
      if (a < 0 && b < 0) next = -1;
      else if (a < 0) next = b;
      else if (b < 0) next = a;
      else next = Math.min(a, b);
      if (next < 0 || next > nextClose) break;
      depth++;
      scan = next + openTag1.length;
    }
    depth--;
    i = nextClose + closeTag.length;
  }
  return i;
}

function replaceCellTextWithPlaceholder(cellXml, placeholder) {
  const tcOpenEnd = cellXml.indexOf(">") + 1;
  const tcCloseStart = cellXml.lastIndexOf("</w:tc>");
  const inner = cellXml.substring(tcOpenEnd, tcCloseStart);

  let tcPr = "";
  let paragraphsRegion = inner;
  const tcPrMatch = inner.match(/^\s*<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  if (tcPrMatch) {
    tcPr = tcPrMatch[0];
    paragraphsRegion = inner.substring(tcPrMatch[0].length);
  }

  const paragraphs = [];
  let i = 0;
  while (i < paragraphsRegion.length) {
    const pStart = paragraphsRegion.indexOf("<w:p", i);
    if (pStart < 0) break;
    const headerEnd = paragraphsRegion.indexOf(">", pStart) + 1;
    const isSelfClose = paragraphsRegion[headerEnd - 2] === "/";
    if (isSelfClose) {
      paragraphs.push({
        start: pStart,
        end: headerEnd,
        text: paragraphsRegion.substring(pStart, headerEnd),
        selfClose: true,
      });
      i = headerEnd;
      continue;
    }
    const pEnd =
      paragraphsRegion.indexOf("</w:p>", headerEnd) + "</w:p>".length;
    paragraphs.push({
      start: pStart,
      end: pEnd,
      text: paragraphsRegion.substring(pStart, pEnd),
      selfClose: false,
    });
    i = pEnd;
  }

  if (paragraphs.length === 0) {
    return (
      "<w:tc>" +
      tcPr +
      `<w:p><w:r><w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>` +
      "</w:tc>"
    );
  }

  const transformed = paragraphs.map((p, idx) => {
    if (p.selfClose) return p.text;
    const inside = p.text.substring(
      p.text.indexOf(">") + 1,
      p.text.length - "</w:p>".length,
    );
    let pPr = "";
    let body = inside;
    const pPrMatch = inside.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/);
    if (pPrMatch) {
      pPr = pPrMatch[0];
      body = inside.substring(pPrMatch[0].length);
    }
    let runRPr = "";
    const firstRunMatch = body.match(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/);
    if (firstRunMatch) {
      const runInner = firstRunMatch[1];
      const rPrMatch = runInner.match(/^\s*<w:rPr>[\s\S]*?<\/w:rPr>/);
      if (rPrMatch) runRPr = rPrMatch[0];
    }
    if (!runRPr && pPr) {
      const pPrRPrMatch = pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      if (pPrRPrMatch) runRPr = pPrRPrMatch[0];
    }

    const openTagEnd = p.text.indexOf(">") + 1;
    const openTag = p.text.substring(0, openTagEnd);

    if (idx === 0) {
      const placeholderRun = `<w:r>${runRPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r>`;
      return openTag + pPr + placeholderRun + "</w:p>";
    } else {
      return openTag + pPr + "</w:p>";
    }
  });

  return "<w:tc>" + tcPr + transformed.join("") + "</w:tc>";
}

function replaceParagraphValue(paragraphXml, placeholder, opts = {}) {
  const { keepLeadingUntilText = null, valueRPr = null } = opts;

  const openTagEnd = paragraphXml.indexOf(">") + 1;
  const openTag = paragraphXml.substring(0, openTagEnd);
  const close = "</w:p>";
  const inner = paragraphXml.substring(
    openTagEnd,
    paragraphXml.length - close.length,
  );

  let pPr = "";
  let body = inner;
  const pPrMatch = inner.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/);
  if (pPrMatch) {
    pPr = pPrMatch[0];
    body = inner.substring(pPrMatch[0].length);
  }

  const tokens = tokenizeRuns(body);

  let splitIdx = tokens.length;
  if (keepLeadingUntilText) {
    let accumulated = "";
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.kind === "r") accumulated += extractVisibleText(t.xml);
      if (keepLeadingUntilText.test(accumulated)) {
        splitIdx = i + 1;
        break;
      }
    }
  }

  const kept = tokens.slice(0, splitIdx);
  const trailing = tokens.slice(splitIdx);

  let runRPr = valueRPr || "";
  if (!runRPr) {
    for (let i = trailing.length - 1; i >= 0; i--) {
      if (trailing[i].kind === "r") {
        const m = trailing[i].xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) {
          runRPr = m[0];
          break;
        }
      }
    }
  }
  if (!runRPr) {
    for (const t of trailing) {
      if (t.kind === "r") {
        const m = t.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) {
          runRPr = m[0];
          break;
        }
      }
    }
  }

  const trailingNonRuns = trailing
    .filter((t) => t.kind !== "r")
    .map((t) => t.xml)
    .join("");

  const placeholderRun = `<w:r>${runRPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r>`;

  return (
    openTag +
    pPr +
    kept.map((t) => t.xml).join("") +
    placeholderRun +
    trailingNonRuns +
    close
  );
}

function tokenizeRuns(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;
    if (body[i] !== "<") {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < body.length && !/[\s>\/]/.test(body[j])) j++;
    const tagName = body.substring(i + 1, j);
    while (j < body.length && body[j] !== ">") j++;
    const isSelfClose = body[j - 1] === "/";
    j++;
    if (isSelfClose) {
      out.push({
        kind: tagName === "w:r" ? "r" : "other",
        xml: body.substring(i, j),
      });
      i = j;
      continue;
    }
    const closeTag = `</${tagName}>`;
    let depth = 1;
    let k = j;
    const openTag1 = `<${tagName}>`;
    const openTag2 = `<${tagName} `;
    while (k < body.length && depth > 0) {
      const nextClose = body.indexOf(closeTag, k);
      if (nextClose < 0) {
        depth = 0;
        k = body.length;
        break;
      }
      let scan = k;
      while (true) {
        const a = body.indexOf(openTag1, scan);
        const b = body.indexOf(openTag2, scan);
        let next;
        if (a < 0 && b < 0) next = -1;
        else if (a < 0) next = b;
        else if (b < 0) next = a;
        else next = Math.min(a, b);
        if (next < 0 || next > nextClose) break;
        depth++;
        scan = next + openTag1.length;
      }
      depth--;
      k = nextClose + closeTag.length;
    }
    out.push({
      kind: tagName === "w:r" ? "r" : "other",
      xml: body.substring(i, k),
    });
    i = k;
  }
  return out;
}

function extractVisibleText(xml) {
  return xml
    .replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<[^>]+>/g, "");
}

function setIndent(pPr, left, firstLine) {
  const ind = `<w:ind w:left="${left}" w:firstLine="${firstLine}"/>`;
  if (!pPr) return `<w:pPr>${ind}</w:pPr>`;
  const body = pPr.replace(/<w:ind\b[^>]*\/>/, "");
  if (/<w:rPr>/.test(body)) return body.replace("<w:rPr>", ind + "<w:rPr>");
  return body.replace("</w:pPr>", ind + "</w:pPr>");
}

function setLeftTab(pPr, pos) {
  const tabs = `<w:tabs><w:tab w:val="left" w:pos="${pos}"/></w:tabs>`;
  if (!pPr) return `<w:pPr>${tabs}</w:pPr>`;
  return pPr.replace(/<w:tabs>[\s\S]*?<\/w:tabs>/, "").replace("<w:pPr>", "<w:pPr>" + tabs);
}

function alignRightWithTab(paragraphXml, pos) {
  const openTagEnd = paragraphXml.indexOf(">") + 1;
  const openTag = paragraphXml.substring(0, openTagEnd);
  const inner = paragraphXml.substring(openTagEnd, paragraphXml.length - "</w:p>".length);
  let pPr = "";
  let body = inner;
  const pPrMatch = inner.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/);
  if (pPrMatch) { pPr = pPrMatch[0]; body = inner.substring(pPrMatch[0].length); }
  pPr = setLeftTab(pPr, pos);
  let tabInserted = false;
  const out = tokenizeRuns(body).flatMap((t) => {
    if (t.kind === "r") {
      const vis = extractVisibleText(t.xml);
      if (vis !== "" && /^\s+$/.test(vis)) {
        if (tabInserted) return [];
        tabInserted = true;
        return ["<w:r><w:tab/></w:r>"];
      }
    }
    return [t.xml];
  });
  return openTag + pPr + out.join("") + "</w:p>";
}

module.exports = {
  findTopLevelChildren,
  findRows,
  findCells,
  closeTagEnd,
  replaceCellTextWithPlaceholder,
  replaceParagraphValue,
  tokenizeRuns,
  extractVisibleText,
  setIndent,
  setLeftTab,
  alignRightWithTab,
};
