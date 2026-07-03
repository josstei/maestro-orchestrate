'use strict';

/**
 * Abstract retrieval seam ranking a corpus of records against a text query.
 * Concrete providers (BM25 today, an embeddings-backed provider later)
 * implement both methods.
 *
 * A record is `{ session_id: string, text: string, summary: object }`.
 * A ranked result is `{ session_id: string, score: number, summary: object }`,
 * ordered by score descending, ties broken by `session_id` ascending.
 */
class RetrievalProvider {
  /**
   * @param {Array<{ session_id: string, text: string, summary: object }>} _records
   * @returns {RetrievalProvider}
   */
  index(_records) {
    throw new Error('RetrievalProvider.index must be implemented by a subclass');
  }

  /**
   * @param {string} _text
   * @param {{ limit?: number }} [_options]
   * @returns {Array<{ session_id: string, score: number, summary: object }>}
   */
  query(_text, _options) {
    throw new Error('RetrievalProvider.query must be implemented by a subclass');
  }
}

module.exports = { RetrievalProvider };
