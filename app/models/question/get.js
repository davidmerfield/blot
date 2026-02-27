const client = require("models/client");
const keys = require("./keys");
const moment = require("moment");

module.exports = id => {
  return new Promise((resolve, reject) => {
    (async () => {
      const [reply_ids, question, last_reply_created_at] = await Promise.all([
        client.zrange(keys.children(id), 0, -1),
        client.hgetall(keys.item(id)),
        client.zscore(keys.by_last_reply, id),
      ]);

      if (!question) return resolve(null);

      const replies = await Promise.all(
        reply_ids.map((reply_id) => {
          return client.hgetall(keys.item(reply_id));
        })
      );

      try {
        question.tags = JSON.parse(question.tags);
      } catch (e) {
        question.tags = [];
      }

      question.replies = replies.map((reply) => {
        const date = new Date(parseInt(reply.created_at, 10));
        reply.time = moment(date).fromNow();
        return reply;
      });

      const createdDate = new Date(parseInt(question.created_at, 10));
      const createdTime = moment(createdDate).fromNow();

      const hasLastReplyTimestamp =
        last_reply_created_at !== null &&
        !Number.isNaN(parseInt(last_reply_created_at, 10));
      const lastReplyTimestamp = hasLastReplyTimestamp
        ? last_reply_created_at
        : question.created_at;
      const lastReplyDate = new Date(parseInt(lastReplyTimestamp, 10));

      question.number_of_replies = replies.length;
      question.last_reply_created_at = lastReplyTimestamp;
      question.last_reply_time = moment(lastReplyDate).fromNow();
      question.created_time = createdTime;
      question.time = createdTime;

      resolve(question);
    })().catch(reject);
  });
};
