async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = [];
  const size = Math.max(1, Math.floor(limit));

  for (let i = 0; i < size; i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item) continue;
          await worker(item);
        }
      })()
    );
  }

  await Promise.all(workers);
}

module.exports = {
  runWithConcurrency,
};
