const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '..', '..', '..', 'data', 'knowledge');

// Each source file is a small JSON document with the metadata described in
// the README (title/source/organization/category/crop/...) plus a `content`
// field holding the original text to chunk. See backend/data/knowledge/ for
// the seed set.
function loadDocuments(dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const doc = JSON.parse(raw);
      if (!doc.title || !doc.content) {
        throw new Error(`Knowledge source ${f} is missing required "title" or "content"`);
      }
      return doc;
    });
}

module.exports = { loadDocuments, DEFAULT_DIR };
