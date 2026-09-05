const client = require("models/client");
const keys = require("./keys");

async function exportQuestions() {
  const allQuestionIds = await client.sMembers(keys.all_questions);
  const allQuestions = [];

  for (const id of allQuestionIds) {
    const question = await client.hGetAll(keys.item(id));

    // map tags to an array
    question.tags = JSON.parse(question.tags);

    const replies = await client.zRange(keys.children(id), 0, -1);

    question.replies = [];
    for (const replyId of replies) {
      const reply = await client.hGetAll(keys.item(replyId));
      const comments = await client.zRange(keys.children(replyId), 0, -1);

      reply.comments = [];
      for (const commentId of comments) {
        const comment = await client.hGetAll(keys.item(commentId));
        // map tags to an array
        comment.tags = JSON.parse(comment.tags);
        reply.comments.push(comment);
      }

      // map tags to an array
      reply.tags = JSON.parse(reply.tags);

      question.replies.push(reply);
    }

    allQuestions.push(question);
  }

  return allQuestions;
}

module.exports = exportQuestions;
