const client = require("models/client");
const keys = require("./keys");
const fs = require('fs-extra');

function smembersAsync(key) {
  return new Promise((resolve, reject) => {
    client.smembers(key, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function hgetallAsync(key) {
  return new Promise((resolve, reject) => {
    client.hgetall(key, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function zrangeAsync(key, start, stop) {
  return new Promise((resolve, reject) => {
    client.zrange(key, start, stop, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function exportQuestions() {
  const allQuestionIds = await smembersAsync(keys.all_questions);
  const allQuestions = [];

  for (const id of allQuestionIds) {
    const question = await hgetallAsync(keys.item(id));

    // map tags to an array
    question.tags = JSON.parse(question.tags);


    const replies = await zrangeAsync(keys.children(id), 0, -1);

    question.replies = [];
    for (const replyId of replies) {
      const reply = await hgetallAsync(keys.item(replyId));
      const comments = await zrangeAsync(keys.children(replyId), 0, -1);

      reply.comments = [];
      for (const commentId of comments) {
        const comment = await hgetallAsync(keys.item(commentId));
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