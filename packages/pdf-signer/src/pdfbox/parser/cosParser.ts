// @ts-nocheck
import type { COSBase } from '../cos/COSBase';
import {
  COSDictionary,
  COSArray,
  COSName,
  COSInteger,
  COSFloat,
  COSString,
  COSObjectReference,
  COSBoolean,
  COSNull,
  COSStream,
} from '../cos/COSTypes';

type Token =
  | { type: 'DICT_START' }
  | { type: 'DICT_END' }
  | { type: 'ARRAY_START' }
  | { type: 'ARRAY_END' }
  | { type: 'NAME'; value: string }
  | { type: 'NUMBER'; value: string }
  | { type: 'STRING'; value: string }
  | { type: 'HEX'; value: string }
  | { type: 'IDENT'; value: string };

class Tokenizer {
  private readonly input: string;
  private index = 0;
  private readonly tokens: Token[] = [];

  constructor(input: string) {
    this.input = input;
    this.tokenize();
  }

  private tokenize() {
    while (this.index < this.input.length) {
      this.skipWhitespace();
      if (this.index >= this.input.length) break;
      const char = this.input[this.index];
      if (char === '%') {
        this.skipComment();
        continue;
      }
      if (char === '<') {
        if (this.peekChar(1) === '<') {
          this.tokens.push({ type: 'DICT_START' });
          this.index += 2;
        } else {
          this.consumeHexString();
        }
        continue;
      }
      if (char === '>') {
        if (this.peekChar(1) === '>') {
          this.tokens.push({ type: 'DICT_END' });
          this.index += 2;
          continue;
        }
        this.index += 1;
        continue;
      }
      if (char === '[') {
        this.tokens.push({ type: 'ARRAY_START' });
        this.index += 1;
        continue;
      }
      if (char === ']') {
        this.tokens.push({ type: 'ARRAY_END' });
        this.index += 1;
        continue;
      }
      if (char === ')') {
        // Unmatched closing paren — skip (corrupt/garbage input)
        this.index += 1;
        continue;
      }
      if (char === '/') {
        this.tokens.push({ type: 'NAME', value: this.consumeName() });
        continue;
      }
      if (char === '(') {
        this.tokens.push({ type: 'STRING', value: this.consumeLiteralString() });
        continue;
      }
      if (this.isNumberStart(char)) {
        this.tokens.push({ type: 'NUMBER', value: this.consumeNumber() });
        continue;
      }
      this.tokens.push({ type: 'IDENT', value: this.consumeIdentifier() });
    }
  }

  private peekChar(offset: number): string | undefined {
    return this.input[this.index + offset];
  }

  private skipWhitespace() {
    while (this.index < this.input.length) {
      const ch = this.input[this.index];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') {
        this.index += 1;
      } else {
        break;
      }
    }
  }

  private skipComment() {
    while (this.index < this.input.length && this.input[this.index] !== '\n' && this.input[this.index] !== '\r') {
      this.index += 1;
    }
  }

  private consumeName(): string {
    this.index += 1; // skip '/'
    const start = this.index;
    while (this.index < this.input.length) {
      const ch = this.input[this.index];
      if (
        ch === ' ' ||
        ch === '\t' ||
        ch === '\n' ||
        ch === '\r' ||
        ch === '\f' ||
        ch === '/' ||
        ch === '%' ||
        ch === '[' ||
        ch === ']' ||
        ch === '<' ||
        ch === '>' ||
        ch === '(' ||
        ch === ')' ||
        ch === '{' ||
        ch === '}'
      ) {
        break;
      }
      this.index += 1;
    }
    return this.input.slice(start, this.index);
  }

  private consumeLiteralString(): string {
    this.index += 1; // skip '('
    let result = '';
    let nesting = 1;
    while (this.index < this.input.length && nesting > 0) {
      const ch = this.input[this.index];
      if (ch === '\\') {
        this.index += 1;
        if (this.index >= this.input.length) break;
        const next = this.input[this.index];
        // PDF spec escape sequences
        switch (next) {
          case 'n': result += '\n'; this.index += 1; break;
          case 'r': result += '\r'; this.index += 1; break;
          case 't': result += '\t'; this.index += 1; break;
          case 'b': result += '\b'; this.index += 1; break;
          case 'f': result += '\f'; this.index += 1; break;
          case '(': result += '('; this.index += 1; break;
          case ')': result += ')'; this.index += 1; break;
          case '\\': result += '\\'; this.index += 1; break;
          case '\r':
            // Backslash + EOL = line continuation (ignore both)
            this.index += 1;
            if (this.index < this.input.length && this.input[this.index] === '\n') {
              this.index += 1;
            }
            break;
          case '\n':
            // Backslash + EOL = line continuation (ignore both)
            this.index += 1;
            break;
          default:
            // Octal escape: 1-3 octal digits
            if (next >= '0' && next <= '7') {
              let octal = next;
              this.index += 1;
              if (this.index < this.input.length && this.input[this.index] >= '0' && this.input[this.index] <= '7') {
                octal += this.input[this.index];
                this.index += 1;
                if (this.index < this.input.length && this.input[this.index] >= '0' && this.input[this.index] <= '7') {
                  octal += this.input[this.index];
                  this.index += 1;
                }
              }
              result += String.fromCharCode(parseInt(octal, 8) & 0xFF);
            } else {
              // Unknown escape: per spec, ignore the backslash
              result += next;
              this.index += 1;
            }
            break;
        }
        continue;
      }
      if (ch === '(') nesting += 1;
      if (ch === ')') nesting -= 1;
      if (nesting > 0) result += ch;
      this.index += 1;
    }
    return result;
  }

  private consumeHexString() {
    this.index += 1; // skip '<'
    const start = this.index;
    while (this.index < this.input.length && this.input[this.index] !== '>') {
      this.index += 1;
    }
    const hex = this.input.slice(start, this.index).replace(/\s+/g, '');
    this.tokens.push({ type: 'HEX', value: hex });
    if (this.input[this.index] === '>') {
      this.index += 1;
    }
  }

  private consumeNumber(): string {
    const start = this.index;
    if (this.input[this.index] === '+' || this.input[this.index] === '-') {
      this.index += 1;
    }
    while (this.index < this.input.length && /[0-9]/.test(this.input[this.index])) {
      this.index += 1;
    }
    if (this.input[this.index] === '.') {
      this.index += 1;
      while (this.index < this.input.length && /[0-9]/.test(this.input[this.index])) {
        this.index += 1;
      }
    }
    return this.input.slice(start, this.index);
  }

  private isNumberStart(char: string): boolean {
    return /[0-9+-]/.test(char);
  }

  private consumeIdentifier(): string {
    const start = this.index;
    while (this.index < this.input.length) {
      const ch = this.input[this.index];
      if (/[ \t\r\n\f<>\[\]()\/{}%]/.test(ch)) break;
      this.index += 1;
    }
    // Guard: if no characters consumed, skip one byte to avoid infinite loop
    if (this.index === start) {
      this.index += 1;
      return this.input[start] ?? '';
    }
    return this.input.slice(start, this.index);
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[offset];
  }

  consume(): Token | undefined {
    return this.tokens.shift();
  }

  hasTokens(): boolean {
    return this.tokens.length > 0;
  }
}

export function parseCOSDictionary(input: string): COSDictionary {
  const tokenizer = new Tokenizer(input);
  const token = tokenizer.consume();
  if (!token || token.type !== 'DICT_START') {
    throw new Error('Expected dictionary start');
  }
  return readDictionary(tokenizer);
}

export function parseCOSObject(input: string): COSBase {
  const tokenizer = new Tokenizer(input);
  const value = readValue(tokenizer);
  if (tokenizer.hasTokens()) {
    throw new Error('Unexpected trailing tokens while parsing object');
  }
  return value;
}

export function parseCOSStreamObject(
  dictionaryLiteral: string,
  streamData: Uint8Array
): COSStream {
  const dict = parseCOSDictionary(dictionaryLiteral);
  return buildCOSStreamFromDictionary(dict, streamData);
}

export function buildCOSStreamFromDictionary(
  dictionary: COSDictionary,
  streamData: Uint8Array
): COSStream {
  const stream = new COSStream();
  for (const [key, value] of dictionary.entrySet()) {
    stream.setItem(key, value);
  }
  stream.setData(streamData);
  return stream;
}

function readDictionary(tokenizer: Tokenizer): COSDictionary {
  const dict = new COSDictionary();
  while (true) {
    const token = tokenizer.consume();
    if (!token) {
      throw new Error('Unexpected EOF while parsing dictionary');
    }
    if (token.type === 'DICT_END') {
      break;
    }
    if (token.type !== 'NAME') {
      throw new Error(`Expected name inside dictionary, got ${token.type}`);
    }
    const value = readValue(tokenizer);
    dict.setItem(new COSName(token.value), value);
  }
  return dict;
}

function readArray(tokenizer: Tokenizer): COSArray {
  const array = new COSArray();
  while (true) {
    const next = tokenizer.peek();
    if (!next) throw new Error('Unexpected EOF while parsing array');
    if (next.type === 'ARRAY_END') {
      tokenizer.consume();
      break;
    }
    array.add(readValue(tokenizer));
  }
  return array;
}

function readValue(tokenizer: Tokenizer): COSBase {
  const token = tokenizer.consume();
  if (!token) {
    throw new Error('Unexpected EOF while reading value');
  }
  switch (token.type) {
    case 'DICT_START':
      return readDictionary(tokenizer);
    case 'ARRAY_START':
      return readArray(tokenizer);
    case 'NAME':
      return new COSName(token.value);
    case 'NUMBER':
      return readNumberOrReference(token, tokenizer);
    case 'STRING':
      return new COSString(token.value);
    case 'HEX': {
      const bytes: number[] = [];
      for (let i = 0; i < token.value.length; i += 2) {
        const pair = token.value.slice(i, i + 2).padEnd(2, '0');
        bytes.push(parseInt(pair, 16));
      }
      return new COSString(new Uint8Array(bytes), true);
    }
    case 'IDENT':
      if (token.value === 'true') return COSBoolean.TRUE;
      if (token.value === 'false') return COSBoolean.FALSE;
      if (token.value === 'null') return COSNull.NULL;
      return new COSName(token.value);
    default:
      throw new Error(`Unsupported token type ${token.type}`);
  }
}

function readNumberOrReference(first: Token, tokenizer: Tokenizer): COSBase {
  const next = tokenizer.peek();
  const nextNext = tokenizer.peek(1);
  if (
    next &&
    next.type === 'NUMBER' &&
    nextNext &&
    nextNext.type === 'IDENT' &&
    nextNext.value === 'R'
  ) {
    tokenizer.consume(); // consume second number
    tokenizer.consume(); // consume R
    return new COSObjectReference(
      parseInt(first.value, 10),
      parseInt(next.value, 10)
    );
  }
  if (first.value.includes('.') || first.value.includes('e') || first.value.includes('E')) {
    return new COSFloat(Number(first.value));
  }
  return new COSInteger(Number(first.value));
}

// @ts-nocheck
