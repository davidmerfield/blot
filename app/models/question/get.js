const client = require("models/client-new");
const keys = require("./keys");
const moment = require("moment");

module.exports = async (id) => {
  const [reply_ids, question, last_reply_created_at] = await Promise.all([
    client.zRange(keys.children(id), 0, -1),
    client.hGetAll(keys.item(id)),
    client.zScore(keys.by_last_reply, id),
  ]);

  if (!question || !Object.keys(question).length) return null;

  const replies = await Promise.all(
    reply_ids.map((reply_id) => {
      return client.hGetAll(keys.item(reply_id));
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

  return question;
};
