/**
 * ContentStreamRedactor — parses PDF content streams and removes content
 * that falls within redaction rectangles.
 *
 * This is a security-critical module. Redaction must ACTUALLY REMOVE content
 * from the content stream, not just cover it with an opaque rectangle.
 *
 * Approach:
 * 1. Tokenize the content stream into PDF tokens
 * 2. Parse tokens into operations (operands + operator)
 * 3. Track graphics state (CTM, text matrix) to determine positions
 * 4. Remove operations whose content falls within redaction rects
 * 5. Append filled rectangles at redaction positions
 * 6. Reassemble the content stream
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RedactionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedactionColor {
  r: number;
  g: number;
  b: number;
}

/** A single token from the content stream. */
export interface CSToken {
  type:
    | 'number'
    | 'string'
    | 'hexstring'
    | 'name'
    | 'operator'
    | 'array_start'
    | 'array_end'
    | 'boolean'
    | 'null'
    | 'inline_image_data';
  value: string;
  numValue?: number;
  /** Raw binary bytes for inline_image_data tokens. */
  rawData?: Uint8Array;
}

/** A parsed operation: operands followed by an operator. */
export interface CSOperation {
  operator: string;
  operands: CSToken[];
}

// ---------------------------------------------------------------------------
// Content Stream Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize a PDF content stream into a sequence of tokens.
 * Content streams have a restricted syntax compared to full PDF objects.
 *
 * Special handling: inline image data (BI...ID <rawbytes> EI) produces an
 * 'inline_image_data' token carrying the raw binary bytes.
 */
export function tokenizeContentStream(data: Uint8Array): CSToken[] {
  const text = new TextDecoder('latin1').decode(data);
  const tokens: CSToken[] = [];
  let i = 0;
  const len = text.length;
  // Track whether we're inside a BI block (between BI and ID)
  let inBIHeader = false;

  while (i < len) {
    const ch = text[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\0' || ch === '\x0C') {
      i++;
      continue;
    }

    // Comment — skip to end of line
    if (ch === '%') {
      while (i < len && text[i] !== '\n' && text[i] !== '\r') i++;
      continue;
    }

    // Parenthesized string literal
    if (ch === '(') {
      i++; // skip opening (
      let depth = 1;
      let str = '';
      while (i < len && depth > 0) {
        const c = text[i];
        if (c === '\\') {
          i++;
          if (i < len) {
            const esc = text[i];
            if (esc === 'n') str += '\n';
            else if (esc === 'r') str += '\r';
            else if (esc === 't') str += '\t';
            else if (esc === 'b') str += '\b';
            else if (esc === 'f') str += '\f';
            else if (esc === '(') str += '(';
            else if (esc === ')') str += ')';
            else if (esc === '\\') str += '\\';
            else if (esc >= '0' && esc <= '7') {
              let octal = esc;
              if (i + 1 < len && text[i + 1] >= '0' && text[i + 1] <= '7') {
                octal += text[++i];
                if (i + 1 < len && text[i + 1] >= '0' && text[i + 1] <= '7') {
                  octal += text[++i];
                }
              }
              str += String.fromCharCode(parseInt(octal, 8));
            } else if (esc === '\r') {
              // line continuation: \<CR> or \<CR><LF>
              if (i + 1 < len && text[i + 1] === '\n') i++;
            } else if (esc === '\n') {
              // line continuation
            } else {
              str += esc;
            }
          }
        } else if (c === '(') {
          depth++;
          str += c;
        } else if (c === ')') {
          depth--;
          if (depth > 0) str += c;
        } else {
          str += c;
        }
        i++;
      }
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Hex string
    if (ch === '<' && (i + 1 >= len || text[i + 1] !== '<')) {
      i++; // skip <
      let hex = '';
      while (i < len && text[i] !== '>') {
        const h = text[i];
        if (h !== ' ' && h !== '\t' && h !== '\r' && h !== '\n') {
          hex += h;
        }
        i++;
      }
      if (i < len) i++; // skip >
      tokens.push({ type: 'hexstring', value: hex });
      continue;
    }

    // Array start
    if (ch === '[') {
      tokens.push({ type: 'array_start', value: '[' });
      i++;
      continue;
    }

    // Array end
    if (ch === ']') {
      tokens.push({ type: 'array_end', value: ']' });
      i++;
      continue;
    }

    // Name
    if (ch === '/') {
      i++; // skip /
      let name = '';
      while (i < len) {
        const c = text[i];
        if (
          c === ' ' || c === '\t' || c === '\r' || c === '\n' ||
          c === '/' || c === '(' || c === ')' || c === '<' || c === '>' ||
          c === '[' || c === ']' || c === '{' || c === '}' || c === '%' ||
          c === '\0' || c === '\x0C'
        ) break;
        // Handle #xx hex escapes in names
        if (c === '#' && i + 2 < len) {
          const hh = text.substring(i + 1, i + 3);
          name += String.fromCharCode(parseInt(hh, 16));
          i += 3;
        } else {
          name += c;
          i++;
        }
      }
      tokens.push({ type: 'name', value: name });
      continue;
    }

    // Number (integer or real) or operator starting with sign
    if (ch === '+' || ch === '-' || ch === '.' || (ch >= '0' && ch <= '9')) {
      let numStr = '';
      // start of number token at index i
      // Check if this looks like a number or an operator
      if (ch === '+' || ch === '-') {
        numStr += ch;
        i++;
        if (i >= len || ((text[i] < '0' || text[i] > '9') && text[i] !== '.')) {
          // It's an operator (e.g., standalone +/-)
          tokens.push({ type: 'operator', value: numStr });
          continue;
        }
      }
      let hasDot = false;
      while (i < len) {
        const c = text[i];
        if (c >= '0' && c <= '9') {
          numStr += c;
          i++;
        } else if (c === '.' && !hasDot) {
          hasDot = true;
          numStr += c;
          i++;
        } else {
          break;
        }
      }
      const numVal = parseFloat(numStr);
      tokens.push({ type: 'number', value: numStr, numValue: numVal });
      continue;
    }

    // Dictionary delimiters << >> — skip them (shouldn't appear in content streams, but handle gracefully)
    if (ch === '<' && i + 1 < len && text[i + 1] === '<') {
      tokens.push({ type: 'operator', value: '<<' });
      i += 2;
      continue;
    }
    if (ch === '>' && i + 1 < len && text[i + 1] === '>') {
      tokens.push({ type: 'operator', value: '>>' });
      i += 2;
      continue;
    }

    // Boolean
    if (text.substring(i, i + 4) === 'true' && (i + 4 >= len || isDelimiter(text[i + 4]))) {
      tokens.push({ type: 'boolean', value: 'true' });
      i += 4;
      continue;
    }
    if (text.substring(i, i + 5) === 'false' && (i + 5 >= len || isDelimiter(text[i + 5]))) {
      tokens.push({ type: 'boolean', value: 'false' });
      i += 5;
      continue;
    }

    // Null
    if (text.substring(i, i + 4) === 'null' && (i + 4 >= len || isDelimiter(text[i + 4]))) {
      tokens.push({ type: 'null', value: 'null' });
      i += 4;
      continue;
    }

    // Operator (alphabetic keyword, or special: *, ', ")
    if (isAlpha(ch) || ch === '\'' || ch === '"' || ch === '*') {
      let op = '';
      while (i < len) {
        const c = text[i];
        if (isAlpha(c) || c === '*' || c === '\'' || c === '"') {
          op += c;
          i++;
        } else {
          break;
        }
      }

      // Track BI/ID state for inline image data handling
      if (op === 'BI') {
        inBIHeader = true;
        tokens.push({ type: 'operator', value: op });
        continue;
      }

      if (op === 'ID' && inBIHeader) {
        inBIHeader = false;
        tokens.push({ type: 'operator', value: 'ID' });

        // Skip single whitespace byte after ID (spec requires one whitespace before data)
        if (i < len && (
          text[i] === ' ' || text[i] === '\t' ||
          text[i] === '\r' || text[i] === '\n' || text[i] === '\x0C'
        )) {
          // If \r\n, skip both
          if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') {
            i += 2;
          } else {
            i++;
          }
        }

        // Scan raw bytes until EI (must be preceded by whitespace)
        // PDF spec: EI operator preceded by a single whitespace character
        const dataStart = i;
        let eiPos = -1;
        while (i < len) {
          // Look for whitespace + 'EI' + (whitespace or end)
          const c = text[i];
          if (
            (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\x0C') &&
            i + 2 < len &&
            text[i + 1] === 'E' &&
            text[i + 2] === 'I' &&
            (i + 3 >= len || isDelimiter(text[i + 3]) || !isAlpha(text[i + 3]))
          ) {
            eiPos = i;
            i += 3; // skip whitespace + EI
            // Skip any trailing whitespace that belongs to EI delimiter
            break;
          }
          i++;
        }

        if (eiPos >= 0) {
          // Extract raw bytes: data[dataStart..eiPos] (chars up to the whitespace before EI)
          const rawData = data.slice(dataStart, eiPos);
          tokens.push({ type: 'inline_image_data', value: '<inline>', rawData });
          tokens.push({ type: 'operator', value: 'EI' });
        }
        // else: malformed inline image, no EI found — skip silently
        continue;
      }

      tokens.push({ type: 'operator', value: op });
      continue;
    }

    // Unknown character — skip
    i++;
  }

  return tokens;
}

function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isDelimiter(ch: string): boolean {
  return (
    ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\0' || ch === '\x0C' ||
    ch === '(' || ch === ')' || ch === '<' || ch === '>' ||
    ch === '[' || ch === ']' || ch === '/' || ch === '%'
  );
}

// ---------------------------------------------------------------------------
// Token to Operations Parser
// ---------------------------------------------------------------------------

/** Known PDF operators and their expected operand counts. -1 means variable. */
const OPERATOR_SET = new Set([
  // Graphics state
  'q', 'Q', 'cm', 'w', 'J', 'j', 'M', 'd', 'ri', 'i', 'gs',
  // Path construction
  'm', 'l', 'c', 'v', 'y', 'h', 're',
  // Path painting
  'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n',
  // Clipping
  'W', 'W*',
  // Text
  'BT', 'ET', 'Tc', 'Tw', 'Tz', 'TL', 'Tf', 'Tr', 'Ts',
  'Td', 'TD', 'Tm', 'T*',
  'Tj', 'TJ', '\'', '"',
  // Color
  'CS', 'cs', 'SC', 'SCN', 'sc', 'scn', 'G', 'g', 'RG', 'rg', 'K', 'k',
  // XObject
  'Do',
  // Inline image
  'BI', 'ID', 'EI',
  // Marked content
  'MP', 'DP', 'BMC', 'BDC', 'EMC',
  // Compatibility
  'BX', 'EX',
  // Type 3 font
  'd0', 'd1',
  // Shading
  'sh',
]);

/**
 * Parse a token stream into operations.
 * In PDF content streams, operands are pushed on a stack, then an operator consumes them.
 */
export function parseOperations(tokens: CSToken[]): CSOperation[] {
  const ops: CSOperation[] = [];
  let operands: CSToken[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // Handle inline images specially: BI <dict tokens> ID <inline_image_data> EI
    // The tokenizer already handled ID→EI extraction and emitted:
    //   BI <dict tokens> ID inline_image_data EI
    if (token.type === 'operator' && token.value === 'BI') {
      // Collect everything from BI through EI as a single BI operation
      const biOperands = [...operands];
      operands = [];
      i++; // skip BI token
      // Collect dict tokens until ID
      while (i < tokens.length && !(tokens[i].type === 'operator' && tokens[i].value === 'ID')) {
        biOperands.push(tokens[i]);
        i++;
      }
      if (i < tokens.length) i++; // skip ID
      // The next token should be inline_image_data (if tokenizer handled it)
      // Otherwise scan tokens until EI (fallback for non-binary data)
      while (i < tokens.length && !(tokens[i].type === 'operator' && tokens[i].value === 'EI')) {
        biOperands.push(tokens[i]);
        i++;
      }
      if (i < tokens.length) i++; // skip EI
      ops.push({ operator: 'BI', operands: biOperands });
      continue;
    }

    // Handle TJ array operand — collect array tokens into operands
    if (token.type === 'array_start') {
      // Collect array as operand tokens
      operands.push(token);
      i++;
      while (i < tokens.length && tokens[i].type !== 'array_end') {
        operands.push(tokens[i]);
        i++;
      }
      if (i < tokens.length) {
        operands.push(tokens[i]); // array_end
        i++;
      }
      continue;
    }

    if (token.type === 'operator' && OPERATOR_SET.has(token.value)) {
      ops.push({ operator: token.value, operands });
      operands = [];
    } else {
      operands.push(token);
    }
    i++;
  }

  // Any leftover operands without an operator (shouldn't happen in valid streams)
  if (operands.length > 0) {
    ops.push({ operator: '', operands });
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Graphics State Tracking
// ---------------------------------------------------------------------------

interface GraphicsState {
  /** Current Transformation Matrix [a, b, c, d, e, f] */
  ctm: number[];
  /** Text matrix [a, b, c, d, e, f] — only valid inside BT..ET */
  textMatrix: number[];
  /** Text line matrix — reset by Td/TD/Tm/T* */
  textLineMatrix: number[];
  /** Current font size (from Tf) */
  fontSize: number;
  /** Text leading (TL) */
  textLeading: number;
}

function identityMatrix(): number[] {
  return [1, 0, 0, 1, 0, 0];
}

function cloneState(state: GraphicsState): GraphicsState {
  return {
    ctm: [...state.ctm],
    textMatrix: [...state.textMatrix],
    textLineMatrix: [...state.textLineMatrix],
    fontSize: state.fontSize,
    textLeading: state.textLeading,
  };
}

/**
 * Multiply two 3x3 transformation matrices (represented as [a,b,c,d,e,f]).
 * Result = m1 * m2 in PDF's pre-multiply convention.
 */
function multiplyMatrices(m1: number[], m2: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

/**
 * Transform a point (x, y) by a matrix [a, b, c, d, e, f].
 * Returns [x', y'].
 */
function transformPoint(matrix: number[], x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = matrix;
  return [
    a * x + c * y + e,
    b * x + d * y + f,
  ];
}

/**
 * Get the current text position in user space.
 * The text rendering position is determined by the text matrix and CTM.
 */
function getTextPosition(state: GraphicsState): [number, number] {
  // Text position in text space is (0, 0) transformed by text matrix
  const [tx, ty] = transformPoint(state.textMatrix, 0, 0);
  // Then transform by CTM to get user space coordinates
  return transformPoint(state.ctm, tx, ty);
}

// ---------------------------------------------------------------------------
// Rectangle Overlap Detection
// ---------------------------------------------------------------------------

function rectsOverlap(
  rect: RedactionRect,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const r1Left = rect.x;
  const r1Right = rect.x + rect.width;
  const r1Bottom = rect.y;
  const r1Top = rect.y + rect.height;

  const r2Left = Math.min(x, x + w);
  const r2Right = Math.max(x, x + w);
  const r2Bottom = Math.min(y, y + h);
  const r2Top = Math.max(y, y + h);

  return r1Left < r2Right && r1Right > r2Left && r1Bottom < r2Top && r1Top > r2Bottom;
}

function pointInRect(rect: RedactionRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width &&
         y >= rect.y && y <= rect.y + rect.height;
}

function pointInAnyRect(rects: RedactionRect[], x: number, y: number): boolean {
  return rects.some(r => pointInRect(r, x, y));
}

// ---------------------------------------------------------------------------
// Operation Serialization
// ---------------------------------------------------------------------------

function serializeToken(token: CSToken): string {
  switch (token.type) {
    case 'number':
      return token.value;
    case 'string': {
      // Re-escape for PDF parenthesized string
      let escaped = '';
      for (const ch of token.value) {
        if (ch === '(' || ch === ')' || ch === '\\') escaped += '\\' + ch;
        else escaped += ch;
      }
      return `(${escaped})`;
    }
    case 'hexstring':
      return `<${token.value}>`;
    case 'name':
      return `/${token.value}`;
    case 'array_start':
      return '[';
    case 'array_end':
      return ']';
    case 'boolean':
    case 'null':
      return token.value;
    case 'operator':
      return token.value;
    default:
      return token.value;
  }
}

function serializeOperation(op: CSOperation): string {
  const parts: string[] = [];
  for (const operand of op.operands) {
    parts.push(serializeToken(operand));
  }
  if (op.operator) {
    parts.push(op.operator);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Core Redaction Engine
// ---------------------------------------------------------------------------

/**
 * Apply redactions to a PDF content stream.
 *
 * This function:
 * 1. Parses the content stream into operations
 * 2. Tracks graphics state to determine positions of content
 * 3. Removes text and graphics operations that fall within redaction rects
 * 4. Appends filled rectangles at redaction positions
 * 5. Returns the rewritten content stream bytes
 *
 * @param contentStream - Raw bytes of the PDF content stream
 * @param redactionRects - Array of rectangles defining areas to redact
 * @param interiorColor - Fill color for redacted areas (default: black)
 * @returns Rewritten content stream with redacted content removed
 */
export function applyRedactions(
  contentStream: Uint8Array,
  redactionRects: RedactionRect[],
  interiorColor?: RedactionColor,
): Uint8Array {
  if (redactionRects.length === 0) {
    return contentStream;
  }

  const color = interiorColor ?? { r: 0, g: 0, b: 0 };
  const tokens = tokenizeContentStream(contentStream);
  const operations = parseOperations(tokens);

  const outputOps: CSOperation[] = [];
  const stateStack: GraphicsState[] = [];
  let state: GraphicsState = {
    ctm: identityMatrix(),
    textMatrix: identityMatrix(),
    textLineMatrix: identityMatrix(),
    fontSize: 12,
    textLeading: 0,
  };
  // Track if we're inside a text block that has any redacted content
  // We still emit BT/ET and state-setting ops, just remove the text-showing ops
  let pathMinX = Infinity;
  let pathMinY = Infinity;
  let pathMaxX = -Infinity;
  let pathMaxY = -Infinity;
  let inPath = false;
  let pathOps: CSOperation[] = [];

  for (const op of operations) {
    const { operator, operands } = op;

    switch (operator) {
      // --- Graphics state ---
      case 'q':
        stateStack.push(cloneState(state));
        outputOps.push(op);
        break;

      case 'Q':
        if (stateStack.length > 0) {
          state = stateStack.pop()!;
        }
        outputOps.push(op);
        break;

      case 'cm': {
        if (operands.length >= 6) {
          const nums = operands.map(o => o.numValue ?? parseFloat(o.value));
          const matrix = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
          state.ctm = multiplyMatrices(matrix, state.ctm);
        }
        outputOps.push(op);
        break;
      }

      // --- Text state ---
      case 'BT':
        state.textMatrix = identityMatrix();
        state.textLineMatrix = identityMatrix();
        outputOps.push(op);
        break;

      case 'ET':
        outputOps.push(op);
        break;

      case 'Tf':
        if (operands.length >= 2) {
          state.fontSize = operands[1].numValue ?? parseFloat(operands[1].value);
        }
        outputOps.push(op);
        break;

      case 'TL':
        if (operands.length >= 1) {
          state.textLeading = operands[0].numValue ?? parseFloat(operands[0].value);
        }
        outputOps.push(op);
        break;

      case 'Tm':
        if (operands.length >= 6) {
          const nums = operands.map(o => o.numValue ?? parseFloat(o.value));
          state.textMatrix = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
          state.textLineMatrix = [...state.textMatrix];
        }
        outputOps.push(op);
        break;

      case 'Td': {
        if (operands.length >= 2) {
          const tx = operands[0].numValue ?? parseFloat(operands[0].value);
          const ty = operands[1].numValue ?? parseFloat(operands[1].value);
          const translateM = [1, 0, 0, 1, tx, ty];
          state.textLineMatrix = multiplyMatrices(translateM, state.textLineMatrix);
          state.textMatrix = [...state.textLineMatrix];
        }
        outputOps.push(op);
        break;
      }

      case 'TD': {
        if (operands.length >= 2) {
          const tx = operands[0].numValue ?? parseFloat(operands[0].value);
          const ty = operands[1].numValue ?? parseFloat(operands[1].value);
          state.textLeading = -ty;
          const translateM = [1, 0, 0, 1, tx, ty];
          state.textLineMatrix = multiplyMatrices(translateM, state.textLineMatrix);
          state.textMatrix = [...state.textLineMatrix];
        }
        outputOps.push(op);
        break;
      }

      case 'T*': {
        const translateM = [1, 0, 0, 1, 0, -state.textLeading];
        state.textLineMatrix = multiplyMatrices(translateM, state.textLineMatrix);
        state.textMatrix = [...state.textLineMatrix];
        outputOps.push(op);
        break;
      }

      // --- Text-showing operators (these get redacted) ---
      case 'Tj': {
        const [posX, posY] = getTextPosition(state);
        if (pointInAnyRect(redactionRects, posX, posY)) {
          // REDACT: remove this text operation
          // Don't emit it
        } else {
          outputOps.push(op);
        }
        break;
      }

      case 'TJ': {
        const [posX, posY] = getTextPosition(state);
        if (pointInAnyRect(redactionRects, posX, posY)) {
          // REDACT: remove this text array operation
        } else {
          outputOps.push(op);
        }
        break;
      }

      case '\'': {
        // Move to next line, then show text (equivalent to T* then Tj)
        const translateM = [1, 0, 0, 1, 0, -state.textLeading];
        state.textLineMatrix = multiplyMatrices(translateM, state.textLineMatrix);
        state.textMatrix = [...state.textLineMatrix];
        const [posX, posY] = getTextPosition(state);
        if (pointInAnyRect(redactionRects, posX, posY)) {
          // Emit T* for line advance but remove text
          outputOps.push({ operator: 'T*', operands: [] });
        } else {
          outputOps.push(op);
        }
        break;
      }

      case '"': {
        // Set word/char spacing, move to next line, show text
        const translateM = [1, 0, 0, 1, 0, -state.textLeading];
        state.textLineMatrix = multiplyMatrices(translateM, state.textLineMatrix);
        state.textMatrix = [...state.textLineMatrix];
        const [posX, posY] = getTextPosition(state);
        if (pointInAnyRect(redactionRects, posX, posY)) {
          // Emit spacing + T* but remove text
          if (operands.length >= 2) {
            outputOps.push({ operator: 'Tw', operands: [operands[0]] });
            outputOps.push({ operator: 'Tc', operands: [operands[1]] });
          }
          outputOps.push({ operator: 'T*', operands: [] });
        } else {
          outputOps.push(op);
        }
        break;
      }

      // --- Path construction ---
      case 'm': {
        if (operands.length >= 2) {
          const px = operands[0].numValue ?? 0;
          const py = operands[1].numValue ?? 0;
          if (!inPath) {
            inPath = true;
            pathMinX = px;
            pathMinY = py;
            pathMaxX = px;
            pathMaxY = py;
            pathOps = [];
          }
          updatePathBounds(px, py);
        }
        pathOps.push(op);
        break;
      }

      case 'l': {
        if (operands.length >= 2) {
          updatePathBounds(operands[0].numValue ?? 0, operands[1].numValue ?? 0);
        }
        pathOps.push(op);
        break;
      }

      case 'c': {
        if (operands.length >= 6) {
          for (let k = 0; k < 6; k += 2) {
            updatePathBounds(operands[k].numValue ?? 0, operands[k + 1].numValue ?? 0);
          }
        }
        pathOps.push(op);
        break;
      }

      case 'v': {
        if (operands.length >= 4) {
          for (let k = 0; k < 4; k += 2) {
            updatePathBounds(operands[k].numValue ?? 0, operands[k + 1].numValue ?? 0);
          }
        }
        pathOps.push(op);
        break;
      }

      case 'y': {
        if (operands.length >= 4) {
          for (let k = 0; k < 4; k += 2) {
            updatePathBounds(operands[k].numValue ?? 0, operands[k + 1].numValue ?? 0);
          }
        }
        pathOps.push(op);
        break;
      }

      case 'h': {
        pathOps.push(op);
        break;
      }

      case 're': {
        if (operands.length >= 4) {
          const rx = operands[0].numValue ?? 0;
          const ry = operands[1].numValue ?? 0;
          const rw = operands[2].numValue ?? 0;
          const rh = operands[3].numValue ?? 0;
          if (!inPath) {
            inPath = true;
            pathMinX = Infinity;
            pathMinY = Infinity;
            pathMaxX = -Infinity;
            pathMaxY = -Infinity;
            pathOps = [];
          }
          updatePathBounds(rx, ry);
          updatePathBounds(rx + rw, ry + rh);
        }
        pathOps.push(op);
        break;
      }

      // --- Path painting operators ---
      case 'S':
      case 's':
      case 'f':
      case 'F':
      case 'f*':
      case 'B':
      case 'B*':
      case 'b':
      case 'b*':
      case 'n': {
        if (inPath) {
          // Transform path bounding box by CTM
          const [txMin, tyMin] = transformPoint(state.ctm, pathMinX, pathMinY);
          const [txMax, tyMax] = transformPoint(state.ctm, pathMaxX, pathMaxY);
          const bboxX = Math.min(txMin, txMax);
          const bboxY = Math.min(tyMin, tyMax);
          const bboxW = Math.abs(txMax - txMin);
          const bboxH = Math.abs(tyMax - tyMin);

          const overlaps = redactionRects.some(r => rectsOverlap(r, bboxX, bboxY, bboxW, bboxH));
          if (overlaps) {
            // REDACT: drop the path operations and paint operator
            // Don't emit pathOps or this operator
          } else {
            // Not redacted — emit path ops + paint operator
            for (const pathOp of pathOps) outputOps.push(pathOp);
            outputOps.push(op);
          }
          inPath = false;
          pathOps = [];
          pathMinX = Infinity;
          pathMinY = Infinity;
          pathMaxX = -Infinity;
          pathMaxY = -Infinity;
        } else {
          outputOps.push(op);
        }
        break;
      }

      // --- Clipping operators ---
      case 'W':
      case 'W*': {
        pathOps.push(op);
        break;
      }

      // --- XObject (images) ---
      case 'Do': {
        // Check if the image's position (from CTM) overlaps a redaction rect
        // Images are placed at (0,0)-(1,1) in image space, scaled by CTM
        const [imgX, imgY] = transformPoint(state.ctm, 0, 0);
        const [imgX2, imgY2] = transformPoint(state.ctm, 1, 1);
        const imgLeft = Math.min(imgX, imgX2);
        const imgBottom = Math.min(imgY, imgY2);
        const imgWidth = Math.abs(imgX2 - imgX);
        const imgHeight = Math.abs(imgY2 - imgY);

        if (redactionRects.some(r => rectsOverlap(r, imgLeft, imgBottom, imgWidth, imgHeight))) {
          // REDACT: remove XObject invocation
        } else {
          outputOps.push(op);
        }
        break;
      }

      // --- Inline images ---
      case 'BI': {
        // For inline images, we check the current position based on CTM
        const [imgX, imgY] = transformPoint(state.ctm, 0, 0);
        const [imgX2, imgY2] = transformPoint(state.ctm, 1, 1);
        const imgLeft = Math.min(imgX, imgX2);
        const imgBottom = Math.min(imgY, imgY2);
        const imgWidth = Math.abs(imgX2 - imgX);
        const imgHeight = Math.abs(imgY2 - imgY);

        if (redactionRects.some(r => rectsOverlap(r, imgLeft, imgBottom, imgWidth, imgHeight))) {
          // REDACT: remove inline image
        } else {
          // Re-emit as BI ... ID ... EI (complex, pass through raw)
          outputOps.push(op);
        }
        break;
      }

      // --- Everything else passes through ---
      default:
        if (inPath) {
          pathOps.push(op);
        } else {
          outputOps.push(op);
        }
        break;
    }
  }

  // Serialize output operations
  const lines: string[] = [];
  for (const op of outputOps) {
    lines.push(serializeOperation(op));
  }

  // Append redaction fill rectangles
  lines.push('q');
  lines.push(`${formatNum(color.r)} ${formatNum(color.g)} ${formatNum(color.b)} rg`);
  for (const rect of redactionRects) {
    lines.push(
      `${formatNum(rect.x)} ${formatNum(rect.y)} ${formatNum(rect.width)} ${formatNum(rect.height)} re`,
    );
    lines.push('f');
  }
  lines.push('Q');

  const result = lines.join('\n');
  return new TextEncoder().encode(result);

  // Local helpers for path tracking
  function updatePathBounds(px: number, py: number): void {
    if (px < pathMinX) pathMinX = px;
    if (py < pathMinY) pathMinY = py;
    if (px > pathMaxX) pathMaxX = px;
    if (py > pathMaxY) pathMaxY = py;
  }
}

function formatNum(n: number): string {
  // Match PDF number formatting — avoid trailing zeros
  if (Number.isInteger(n)) return n.toString();
  const s = n.toString();
  // Avoid exponential notation
  if (s.includes('e') || s.includes('E')) {
    return n.toFixed(6).replace(/\.?0+$/, '');
  }
  return s;
}
