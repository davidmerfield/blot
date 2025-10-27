const client = require("models/client");
const keys = require("./keys");
const PAGE_SIZE = 20;

// assign a score to each question based on how well it matches the query
// the title is more important than the body and a complete word match is more important than a partial word match
// after the body, the body of the replies is considered
const Score = (query, result) => {
  // trim, lowercase, and split the query into words
  const title = result.title.toLowerCase();
  const body = result.body.toLowerCase();
  const queryWords = query.trim().toLowerCase().split(" ");

  const titleScore = queryWords.reduce((score, word) => {
    if (title.includes(word)) {
      return score + 1;
    } else {
      return score;
    }
  }, 0);

  const bodyScore = queryWords.reduce((score, word) => {
    if (body.includes(word)) {
      return score + 1;
    } else {
      return score;
    }
  }, 0);

  const replyScore = result.replies.reduce((score, reply) => {
    const replyBody = reply.body.toLowerCase();

    return queryWords.reduce((score, word) => {
      if (replyBody.includes(word)) {
        return score + 1;
      } else {
        return score;
      }
    }, score);
  }, 0);

  return titleScore * 3 + bodyScore + replyScore;
};

// sort the questions by score and paginate them
const sortAndPaginate = (questions, page_size, page) => {
  questions.sort((a, b) => b.score - a.score);

  const startIndex = (page - 1) * page_size;
  const endIndex = startIndex + page_size - 1;

  return questions.slice(startIndex, endIndex + 1);
};

const hasNonEmptyBody = body => typeof body === "string" && body.trim().length > 0;

const load = ids => {
  return new Promise((resolve, reject) => {
    const batch = client.batch();

    ids.forEach(id => {
      batch.zrange(keys.children(id), 0, -1);
    });

    batch.exec((err, results) => {
      if (err) {
        return reject(err);
      }

      const batch = client.batch();

      ids.forEach(id => {
        batch.hgetall(keys.item(id));
      });

      results.forEach(ids => {
        ids.forEach(id => {
          batch.hgetall(keys.item(id));
        });
      });

      batch.exec((err, results) => {
        if (err) {
          return reject(err);
        }

        const questions = results
          .filter(result => result && !result.parent && hasNonEmptyBody(result.body))
          .map(result => {
            result.replies = results
              .filter(
                reply =>
                  reply &&
                  reply.parent === result.id &&
                  hasNonEmptyBody(reply.body)
              )
              .map(reply => {
                return { body: reply.body };
              });

            return {
              id: result.id,
              title: result.title,
              body: result.body,
              replies: result.replies
            };
          });

        resolve(questions);
      });
    });
  });
};

module.exports = ({ query, page = 1, page_size = PAGE_SIZE } = {}) => {
  return new Promise((resolve, reject) => {
    const key = keys.all_questions;
    const questions = [];
    const cursor = 0;

    const iterate = async (err, [cursor, ids]) => {
      if (err) {
        return reject(err);
      }

      const candidates = await load(ids);

      candidates.forEach(result => {
        const score = Score(query, result);
        if (score > 0) {
          questions.push({
            title: result.title,
            id: result.id,
            score
          });
        }
      });

      // we have enough questions to fill a page
      if (questions.length >= page_size * page) {
        return resolve(sortAndPaginate(questions, page_size, page));

        // we have reached the end of the questions and there are no more questions to retrieve
      } else if (cursor === "0") {
        return resolve(sortAndPaginate(questions, page_size, page));
      } else {
        return client.sscan(key, cursor, iterate);
      }
    };

    // iterate over the question ids, retrieve the title, and body of each question and see if they contain the query
    client.sscan(key, cursor, iterate);
  });
};
