const K1 = 1.2;
const B = 0.75;

/**
 * Lowercase + Unicode-aware tokenizer. Splits on any run of characters that
 * are neither Unicode letters nor numbers, so file paths and punctuation
 * decompose into stable tokens.
 *
 * @param {unknown} text
 * @returns {string[]}
 */
function tokenize(text) {
  return String(text === null || text === undefined ? '' : text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/**
 * Deterministic hand-rolled BM25/TF-IDF provider. Pure Node, zero deps.
 * Enforces a strict total order: score descending, ties broken by
 * `session_id` ascending, independent of index/input order.
 *
 * A record is `{ session_id: string, text: string, summary: object }`.
 * A ranked result is `{ session_id: string, score: number, summary: object }`,
 * ordered by score descending, ties broken by `session_id` ascending.
 */
class Bm25Provider {
  constructor() {
    this.documents = [];
    this.documentFrequency = new Map();
    this.averageLength = 0;
  }

  /**
   * @param {Array<{ session_id: string, text: string, summary: object }>} records
   * @returns {Bm25Provider}
   */
  index(records) {
    const list = Array.isArray(records) ? records : [];
    this.documents = [];
    this.documentFrequency = new Map();
    let totalLength = 0;
    for (const record of list) {
      const tokens = tokenize(record.text);
      const termFrequency = new Map();
      for (const token of tokens) {
        termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
      }
      for (const token of termFrequency.keys()) {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
      }
      totalLength += tokens.length;
      this.documents.push({
        session_id: record.session_id,
        summary: record.summary,
        termFrequency,
        length: tokens.length,
      });
    }
    this.averageLength = this.documents.length > 0 ? totalLength / this.documents.length : 0;
    return this;
  }

  /**
   * @param {string[]} queryTokens
   * @param {{ termFrequency: Map<string, number>, length: number }} document
   * @returns {number}
   */
  scoreDocument(queryTokens, document) {
    const total = this.documents.length;
    let score = 0;
    for (const token of queryTokens) {
      const frequency = document.termFrequency.get(token);
      if (!frequency) continue;
      const docsWith = this.documentFrequency.get(token) || 0;
      const idf = Math.log(1 + (total - docsWith + 0.5) / (docsWith + 0.5));
      const denominator =
        frequency + K1 * (1 - B + (B * document.length) / (this.averageLength || 1));
      score += idf * ((frequency * (K1 + 1)) / denominator);
    }
    return score;
  }

  /**
   * @param {string} text
   * @param {{ limit?: number }} [options]
   * @returns {Array<{ session_id: string, score: number, summary: object }>}
   */
  query(text, options) {
    const queryTokens = tokenize(text);
    const scored = this.documents.map((document) => ({
      session_id: document.session_id,
      score: this.scoreDocument(queryTokens, document),
      summary: document.summary,
    }));
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.session_id < b.session_id) return -1;
      if (a.session_id > b.session_id) return 1;
      return 0;
    });
    const limit =
      options && Number.isInteger(options.limit) && options.limit > 0
        ? options.limit
        : scored.length;
    return scored.slice(0, limit);
  }
}

export { Bm25Provider, tokenize, K1, B };
