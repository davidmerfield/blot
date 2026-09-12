"use strict";

/**
 * Fetch does not reject on a 4xx/5xx response, so every burst phase must
 * check the status itself - otherwise a routing or rendering failure specific
 * to that phase's URLs can make it look *faster* (an error page renders
 * quicker than the real one) while still producing a passing benchmark.
 * Also consumes the response body so an unread stream doesn't tie up a
 * connection across the dozens of requests each burst phase fires.
 *
 * Most bursts target real pages and just want "it succeeded" (any status
 * under 400). The not-found burst deliberately requests a page that doesn't
 * exist, so it passes `expectedStatus: 404` to assert the *specific* status
 * it's timing, rather than accepting whatever comes back.
 */
async function timedRequest(getForBlog, blog, url, { expectedStatus } = {}) {
  const res = await getForBlog(blog, url, { redirect: "manual" });
  await res.arrayBuffer();

  const ok =
    expectedStatus !== undefined
      ? res.status === expectedStatus
      : res.status < 400;

  if (!ok) {
    throw new Error(
      `Burst request to ${url} on ${blog.handle} failed: status=${res.status}` +
        (expectedStatus !== undefined ? ` (expected ${expectedStatus})` : "")
    );
  }

  return res;
}

module.exports = { timedRequest };
