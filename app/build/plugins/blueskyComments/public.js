const convertToAtUri = (url) => {
  const match = url.match(
    /https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/]+)/
  );
  if (!match) throw new Error("Invalid Bluesky URL format.");
  const did = match[1];
  const rkey = match[2];
  return `at://${did}/app.bsky.feed.post/${rkey}`;
};

const extractHandleFromProfileUrl = (profileUrl) => {
  // Extract handle from profile URL (e.g., https://bsky.app/profile/example.bsky.social)
  const match = profileUrl.match(/https?:\/\/bsky\.app\/profile\/([^/?]+)/);
  if (match) {
    return match[1];
  }

  throw new Error("Invalid Bluesky profile URL format.");
};

const renderActions = (post) => {
  return `
        <div class="post-actions">
            <div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="var(--highlight)" viewBox="0 0 24 24" stroke-width="1.5" stroke="var(--highlight2)" width="16" height="16">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                </svg>
                <span>${post.likeCount}</span>
            </div>
            <div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="var(--highlight2)" width="16" height="16">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                </svg>
                <span>${post.repostCount}</span>
            </div>
            <div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="var(--highlight)" viewBox="0 0 24 24" stroke-width="1.5" stroke="var(--highlight2)" width="16" height="16">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                </svg>
                <span>${post.replyCount}</span>
            </div>
        </div>
    `;
};

const renderComment = (post) => {
  const author = post.author;
  const postUrl = `https://bsky.app/profile/${author.did}/post/${post.uri
    .split("/")
    .pop()}`;

  return `
        <div class="comment-container">
            <img src="${author.avatar}" alt="avatar">
            <a href="${postUrl}" target="_blank">
                <span class="author">@${author.handle}</span>
                <p>${post.record?.text}</p>
                ${renderActions(post)}
            </a>
        </div>
    `;
};

const renderThread = (thread) => {
  // Handle replies: filter, sort, and limit to 3
  const repliesHtml =
    thread.replies
      .sort((a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0))
      .slice(0, 3)
      .map((reply) => renderComment(reply.post))
      .join("") || "";

  return `
        <div class="comment">
            ${renderComment(thread.post)}
            ${repliesHtml ? `<div class="replies">${repliesHtml}</div>` : ""}
        </div>
    `;
};

const loadThread = (uri, container, originalUrl) => {
  fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(
      uri
    )}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    }
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(await response.text());

      const { thread } = await response.json();
      const replies = (thread.replies || []).sort(
        (a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0)
      );

      // Add main post actions if element exists
      const mainPostActions = document.getElementById("main-post-actions");
      if (mainPostActions) {
        mainPostActions.innerHTML = renderActions(thread.post);
      }

      // Append top 25 comments
      container.innerHTML += replies.slice(0, 25).map(renderThread).join("");

      // Add "Show More" button if there are more comments
      if (replies.length > 25 && !container.querySelector("#see-more")) {
        const postUrl =
          originalUrl ||
          `https://bsky.app/profile/${thread.post.author.did}/post/${uri
            .split("/")
            .pop()}`;
        container.innerHTML += `<a href="${postUrl}" target="_blank" id="see-more">See more on Bluesky</a>`;
      }
    })
    .catch((error) => {
      console.error("Error loading thread:", error);
      container.innerHTML = `<p>Error loading comments. <a href="https://bsky.app" target="_blank">Post on Bluesky</a> to start the discussion!</p>`;
    });
};

const init = () => {
  const container = document.getElementById("comments");

  if (!container) return;

  // Priority 1: Use Bluesky metadata if set
  if (container.dataset.uri) {
    const uri = convertToAtUri(container.dataset.uri);
    loadThread(uri, container, container.dataset.uri);
  }
  // Priority 2: Auto-discover using author search
  else if (
    container.dataset.autoDiscover === "true" &&
    container.dataset.author
  ) {
    const authorProfileUrl = container.dataset.author;
    const author = extractHandleFromProfileUrl(authorProfileUrl);
    const fetchPost = async () => {
      const currentUrl = window.location.href;
      const apiUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=*&url=${encodeURIComponent(
        currentUrl
      )}&author=${encodeURIComponent(author)}&sort=top`;

      try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.posts && data.posts.length > 0) {
          const post = data.posts[0];
          const uri = post.uri;

          // Update container with comments header
          container.innerHTML = `
                    <h2>Comments</h2>
                    <p>Post a comment <a href="https://bsky.app/profile/${
                      post.author.did
                    }/post/${uri
            .split("/")
            .pop()}" target="_blank">on Bluesky</a>!</p>
                `;

          // Add main post actions element
          container.innerHTML += `<a id="main-post-actions" target="_blank" href="https://bsky.app/profile/${
            post.author.did
          }/post/${uri.split("/").pop()}"></a>`;

          // Load the thread
          loadThread(
            uri,
            container,
            `https://bsky.app/profile/${post.author.did}/post/${uri
              .split("/")
              .pop()}`
          );
        } else {
          container.innerHTML = `
                    <h2>Comments</h2>
                    <p>No Bluesky post found for this page. <a href="https://bsky.app" target="_blank">Post on Bluesky</a> to start the discussion!</p>
                `;
        }
      } catch (err) {
        console.error("Error fetching post:", err);
        container.innerHTML = `
                <h2>Comments</h2>
                <p>Error searching for Bluesky post. <a href="https://bsky.app" target="_blank">Post on Bluesky</a> to start the discussion!</p>
            `;
      }
    };

    fetchPost();
  }
  // Priority 3: Show error message if no author configured
  // Error message is already in the HTML from entry.html, no action needed
};

init();
