// Fast, dependency-free drop-in for make.fun csv-reader 1.0.0.
// The parser preserves the reference's recovery rules for malformed CSV.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const length = text.length;
  const hasHeader = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;
  let fieldValue = '';
  let fieldEnd = END;
  let fieldAdded = 0;

  function addError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Read one unquoted field, optionally appending to an already-decoded quoted value.
  // A single scan finds the next structural character without repeated indexOf passes.
  function readUnquoted(base, trackAdded = false) {
    let segment = pos;
    let chunks = null;
    let added = 0;

    for (;;) {
      let next = pos;
      let code = 0;
      while (next < length) {
        code = text.charCodeAt(next);
        if (code === 44 || code === 10 || code === 13) break;
        next++;
      }

      if (next === length) {
        if (trackAdded) added += length - segment;
        const tail = text.slice(segment);
        if (chunks === null) fieldValue = base + tail;
        else {
          chunks.push(tail);
          fieldValue = chunks.join('');
        }
        pos = length;
        fieldEnd = END;
        fieldAdded = trackAdded ? added : 0;
        return END;
      }

      if (code === 44) {
        if (trackAdded) added += next - segment;
        const tail = text.slice(segment, next);
        if (chunks === null) fieldValue = base + tail;
        else {
          chunks.push(tail);
          fieldValue = chunks.join('');
        }
        pos = next + 1;
        fieldEnd = COMMA;
        fieldAdded = trackAdded ? added : 0;
        return COMMA;
      }

      if (code === 10) {
        if (trackAdded) added += next - segment;
        const tail = text.slice(segment, next);
        if (chunks === null) fieldValue = base + tail;
        else {
          chunks.push(tail);
          fieldValue = chunks.join('');
        }
        pos = next + 1;
        line += 1;
        fieldEnd = LINE_BREAK;
        fieldAdded = trackAdded ? added : 0;
        return LINE_BREAK;
      }

      if (next + 1 < length && text.charCodeAt(next + 1) === 10) {
        if (trackAdded) added += next - segment;
        const tail = text.slice(segment, next);
        if (chunks === null) fieldValue = base + tail;
        else {
          chunks.push(tail);
          fieldValue = chunks.join('');
        }
        pos = next + 2;
        line += 1;
        fieldEnd = LINE_BREAK;
        fieldAdded = trackAdded ? added : 0;
        return LINE_BREAK;
      }

      addError('stray_cr');
      if (trackAdded) added += next - segment;
      if (chunks === null) chunks = [base, text.slice(segment, next)];
      else chunks.push(text.slice(segment, next));
      pos = next + 1;
      segment = pos;
    }
  }

  // Read a field opened by a quote. If it never closes, replay it as unquoted exactly as the reference does.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const valueStart = ++pos;
    let segment = pos;
    let chunks = null;
    let close = -1;

    while (pos < length) {
      let next = pos;
      let code = 0;
      while (next < length) {
        code = text.charCodeAt(next);
        if (code === 34 || code === 13 || code === 10) break;
        next++;
      }
      if (next === length) {
        pos = length;
        break;
      }

      if (code === 34) {
        if (next + 1 < length && text.charCodeAt(next + 1) === 34) {
          if (chunks === null) chunks = [];
          chunks.push(text.slice(segment, next), '"');
          pos = next + 2;
          segment = pos;
          continue;
        }
        close = next;
        pos = next + 1;
        break;
      }

      if (code === 13) {
        if (chunks === null) chunks = [];
        chunks.push(text.slice(segment, next), '\n');
        line += 1;
        pos = next + (next + 1 < length && text.charCodeAt(next + 1) === 10 ? 2 : 1);
        segment = pos;
      } else {
        line += 1;
        pos = next + 1;
      }
    }

    if (close === -1) {
      pos = open + 1;
      line = openLine;
      addError('unterminated_quote');
      return readUnquoted('"');
    }

    if (chunks === null) fieldValue = text.slice(valueStart, close);
    else {
      chunks.push(text.slice(segment, close));
      fieldValue = chunks.join('');
    }

    if (pos >= length) {
      fieldEnd = END;
      fieldAdded = 0;
      return END;
    }

    const code = text.charCodeAt(pos);
    if (code === 44) {
      pos += 1;
      fieldEnd = COMMA;
      fieldAdded = 0;
      return COMMA;
    }
    if (code === 10) {
      pos += 1;
      line += 1;
      fieldEnd = LINE_BREAK;
      fieldAdded = 0;
      return LINE_BREAK;
    }
    if (code === 13 && pos + 1 < length && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fieldEnd = LINE_BREAK;
      fieldAdded = 0;
      return LINE_BREAK;
    }

    const ended = readUnquoted(fieldValue, true);
    if (fieldAdded > 0) addError('quote_junk');
    return ended;
  }

  for (;;) {
    // Empty lines are ignored; CRLF is one line break, while a lone CR begins a record.
    while (pos < length) {
      const code = text.charCodeAt(pos);
      if (code === 10) {
        pos += 1;
        line += 1;
      } else if (code === 13 && pos + 1 < length && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else break;
    }
    if (pos >= length) break;

    recordLine = line;
    recordRow = hasHeader && columns === null ? null : rows.length;
    const fields = [];
    let fieldCount = 0;
    let quoted = false;
    let ended;
    do {
      quoted = pos < length && text.charCodeAt(pos) === 34;
      ended = quoted ? readQuoted() : readUnquoted('');
      fields[fieldCount++] = fieldValue;
    } while (ended === COMMA);

    // A line containing only stray CR characters has errors but no record.
    if (fieldCount === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (hasHeader && columns === null) {
      columns = fields;
      continue;
    }

    if (fieldCount < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fieldCount });
      while (fields.length < width) fields.push('');
    } else if (fieldCount > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }

  return { columns: hasHeader ? (columns ?? []) : null, rows, errors };
}
