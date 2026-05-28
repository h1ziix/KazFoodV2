/**
 * Strict DOCX integrity validator.
 *
 * Given a DOCX buffer (or path), unzip in-memory, then:
 *   1. XML-parse every .xml / .rels part with @xmldom/xmldom (strict).
 *   2. For word/document.xml + header*.xml + footer*.xml, balance-check
 *      each WordprocessingML container element (<w:tbl>, <w:tr>, <w:tc>,
 *      <w:p>, <w:r>) using a sequential open/close stack scan.
 *
 * Throws on first failure with a precise message + byte offset + a
 * 400-char snippet of the offending region.
 *
 * Usage:
 *   import { validateDocxBuffer, validateDocxFile } from "./lib/validate-docx.mjs";
 *   validateDocxBuffer(buf, "label");
 */
import fs from "node:fs";
import PizZip from "pizzip";
import { DOMParser } from "@xmldom/xmldom";

const CONTAINER_TAGS = ["w:tbl", "w:tr", "w:tc", "w:p", "w:r"];

function parseStrict(xml, partName, label) {
  let firstErr = null;
  const parser = new DOMParser({
    onError: (level, msg) => {
      // level is 'warning' | 'error' | 'fatalError'
      if (level !== "warning" && !firstErr) {
        firstErr = `${level}: ${msg}`;
      }
    },
  });
  let doc;
  try {
    doc = parser.parseFromString(xml, "application/xml");
  } catch (e) {
    throw new Error(
      `[${label}] XML parse threw for ${partName}: ${e.message}`,
    );
  }
  if (firstErr) {
    throw new Error(`[${label}] XML invalid in ${partName}: ${firstErr}`);
  }
  // Detect <parsererror> nodes that xmldom may inject silently.
  if (doc && doc.getElementsByTagName) {
    const errNodes = doc.getElementsByTagName("parsererror");
    if (errNodes && errNodes.length > 0) {
      throw new Error(
        `[${label}] XML parsererror in ${partName}: ${errNodes[0].textContent}`,
      );
    }
  }
  return doc;
}

/**
 * Scan tokens of `<tag …>`, `<tag/>` and `</tag>` in document order and
 * verify the stack is balanced for each of CONTAINER_TAGS.
 *
 * NOTE: this is intentionally conservative — it only tracks the tags
 * listed in `tags`, ignoring siblings. That makes it robust against
 * unknown elements while catching real structural breaks.
 */
function checkBalance(xml, partName, label, tags = CONTAINER_TAGS) {
  // Build one regex matching only the tags we care about.
  //
  // We must detect self-closing tags like `<w:p w14:paraId="..."/>` —
  // the attribute portion is `[^>]*` which would otherwise greedily
  // swallow the trailing `/`. We split into two alternatives:
  //   (A) self-closing: `<tag ...attrs.../>` — attrs end with `/`
  //   (B) open or close: `</?tag ...attrs...>` — attrs do NOT end with `/`
  const tagAlt = tags
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  // Group 1 = "/" if close, group 2 = tag name, group 3 = "/" if self-close
  const re = new RegExp(
    `<(/)?(${tagAlt})(?:\\s[^>]*?)?(/)?>`,
    "g",
  );
  const stack = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const isClose = m[1] === "/";
    const tag = m[2];
    const selfClose = m[3] === "/";
    if (selfClose) continue; // <w:p .../> etc — no nesting impact
    if (!isClose) {
      stack.push({ tag, offset: m.index });
    } else {
      const top = stack.pop();
      if (!top) {
        throw new Error(
          `[${label}] Unbalanced ${partName}: stray </${tag}> at offset ${m.index}\n` +
            `--- context ---\n${snippet(xml, m.index)}\n---`,
        );
      }
      if (top.tag !== tag) {
        throw new Error(
          `[${label}] Unbalanced ${partName}: </${tag}> at offset ${m.index} ` +
            `closes <${top.tag}> opened at offset ${top.offset}\n` +
            `--- open context ---\n${snippet(xml, top.offset)}\n` +
            `--- close context ---\n${snippet(xml, m.index)}\n---`,
        );
      }
    }
  }
  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    throw new Error(
      `[${label}] Unbalanced ${partName}: <${top.tag}> at offset ${top.offset} never closed\n` +
        `--- context ---\n${snippet(xml, top.offset)}\n---`,
    );
  }
}

function snippet(xml, offset, before = 200, after = 200) {
  const s = Math.max(0, offset - before);
  const e = Math.min(xml.length, offset + after);
  return xml.slice(s, e);
}

export function validateDocxBuffer(buf, label = "docx") {
  const zip = new PizZip(buf);
  const files = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

  // 1. XML parse every .xml / .rels part.
  for (const name of files) {
    if (!/\.(xml|rels)$/i.test(name)) continue;
    const text = zip.files[name].asText();
    parseStrict(text, name, label);
  }

  // 2. Balance-check WordprocessingML parts.
  for (const name of files) {
    if (
      name === "word/document.xml" ||
      /^word\/header\d*\.xml$/.test(name) ||
      /^word\/footer\d*\.xml$/.test(name)
    ) {
      const text = zip.files[name].asText();
      checkBalance(text, name, label);
    }
  }

  return { ok: true, partCount: files.length };
}

export function validateDocxFile(filePath, label) {
  const buf = fs.readFileSync(filePath);
  return validateDocxBuffer(buf, label || filePath);
}
