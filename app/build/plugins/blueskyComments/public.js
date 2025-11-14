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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002ZM4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.58 20.58 0 0 0 8 13.393a20.58 20.58 0 0 0 3.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 0 1-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5Z"></path></svg>
                <span>${post.likeCount}</span>
            </div>
            <div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path></svg>
                <span>${post.repostCount}</span>
            </div>
            <div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M6.78 1.97a.75.75 0 0 1 0 1.06L3.81 6h6.44A4.75 4.75 0 0 1 15 10.75v2.5a.75.75 0 0 1-1.5 0v-2.5a3.25 3.25 0 0 0-3.25-3.25H3.81l2.97 2.97a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L1.47 7.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"></path></svg>
                <span>${post.replyCount}</span>
            </div>
        </div>
    `;
};

const renderComment = (post) => {
    console.log(post);

  const author = post.author;
  const postUrl = `https://bsky.app/profile/${author.did}/post/${post.uri
    .split("/")
    .pop()}`;

  return `
        <div class="comment-container">
            <a href="${postUrl}" target="_blank">
                <img src="${author.avatar}" alt="avatar">
            </a>
            <div>
                <a href="${postUrl}" target="_blank">
                    <strong class="author">${author.displayName}</strong>
                </a>
                <p>${post.record?.text}</p>
                ${renderActions(post)}
            </div>
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
    // Add initial content for metadata case
    container.innerHTML += `<p><a href="${container.dataset.uri}" target="_blank">Reply on Bluesky</a></p>`;
    loadThread(uri, container, container.dataset.uri);
  }
  // Priority 2: Auto-discover using author search
  else if (
    container.dataset.autoDiscover === "true" &&
    container.dataset.author
  ) {
    // Add loading message
    container.innerHTML += `<p>Loading comments...</p>`;
    
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
                    <p><a href="https://bsky.app/profile/${
                      post.author.did
                    }/post/${uri
            .split("/")
            .pop()}" target="_blank">Reply on Bluesky</a></p>
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
  else if (container.dataset.error === "no-author") {
    container.innerHTML += `<p>Bluesky comments are not configured. Please set a <code>Bluesky</code> metadata field on this entry, or configure your Bluesky author handle in the plugin settings.</p>`;
  }
};

init();
