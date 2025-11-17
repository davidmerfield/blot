const Transformer = require("helper/transformer");
const TransformerKeys = require("helper/transformer/keys");
const client = require("models/client");

function createTransformer(blogID, name) {
  if (!blogID || !name) return null;

  try {
    const transformer = new Transformer(blogID, name);
    transformer._blogID = blogID;
    transformer._name = name;
    return transformer;
  } catch (err) {
    return null;
  }
}

function transformerLookup(transformer, src, transformFactory, fallback) {
  return new Promise((resolve) => {
    const handleFallback = () => {
      if (!fallback) return resolve(null);
      Promise.resolve()
        .then(() => fallback())
        .then((result) => resolve(result || null))
        .catch(() => resolve(null));
    };

    if (!transformer) {
      return handleFallback();
    }

    try {
      transformer.lookup(src, transformFactory, async (err, result) => {
        if (!err && result) {
          return resolve(result);
        }

        const cached = await readTransformerResult(transformer, src);
        if (cached) {
          return resolve(cached);
        }

        handleFallback();
      });
    } catch (err) {
      readTransformerResult(transformer, src)
        .then((cached) => {
          if (cached) return resolve(cached);
          handleFallback();
        })
        .catch(() => handleFallback());
    }
  });
}

function readTransformerResult(transformer, src) {
  return new Promise((resolve) => {
    if (!transformer || !transformer._blogID || !transformer._name) {
      return resolve(null);
    }

    let keys;

    try {
      keys = TransformerKeys(transformer._blogID, transformer._name);
    } catch (err) {
      return resolve(null);
    }

    const urlContentKey = keys.url.content(src);

    client.get(urlContentKey, (err, hash) => {
      if (err || !hash) return resolve(null);

      client.get(keys.content(hash), (contentErr, payload) => {
        if (contentErr || !payload) return resolve(null);

        try {
          const parsed = JSON.parse(payload);
          resolve(parsed || null);
        } catch (parseErr) {
          resolve(null);
        }
      });
    });
  });
}

module.exports = {
  createTransformer,
  transformerLookup,
  readTransformerResult,
};
