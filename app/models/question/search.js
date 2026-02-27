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

const hasNonEmptyBody = (body) =>
  typeof body === "string" && body.trim().length > 0;

const hasNonEmptyTitle = (title) =>
  typeof title === "string" && title.trim().length > 0;

const load = (ids) => {
  return new Promise((resolve, reject) => {
    (async () => {
      const childIDs = await Promise.all(
        ids.map((id) => {
          return client.zrange(keys.children(id), 0, -1);
        })
      );

      const results = await Promise.all([
        ...ids.map((id) => client.hgetall(keys.item(id))),
        ...childIDs.flat().map((id) => client.hgetall(keys.item(id))),
      ]);

      const questions = results
        .filter(
          (result) =>
            result &&
            !result.parent &&
            hasNonEmptyBody(result.body) &&
            hasNonEmptyTitle(result.title)
        )
        .map((result) => {
          result.replies = results
            .filter(
              (reply) =>
                reply &&
                reply.parent === result.id &&
                hasNonEmptyBody(reply.body)
            )
            .map((reply) => {
              return { body: reply.body };
            });

          return {
            id: result.id,
            title: result.title,
            body: result.body,
            replies: result.replies,
          };
        });

      resolve(questions);
    })().catch(reject);
  });
};

module.exports = ({ query, page = 1, page_size = PAGE_SIZE } = {}) => {
  return new Promise((resolve, reject) => {
    const key = keys.all_questions;
    const questions = [];
    const cursor = "0";

    const iterate = async (err, res) => {
      if (err) {
        return reject(err);
      }

      if (!res || typeof res !== "object" || !Object.prototype.hasOwnProperty.call(res, "cursor")) {
        return reject(new Error("Unexpected SSCAN reply: " + JSON.stringify(res)));
      }

      const cursor = String(res.cursor);
      const ids = res.members || [];
      const candidates = await load(ids);

      candidates.forEach((result) => {
        const score = Score(query, result);
        if (score > 0) {
          questions.push({
            title: result.title,
            id: result.id,
            score,
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
