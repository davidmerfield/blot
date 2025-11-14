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
  const match = profileUrl.match(/https?:\/\/bsky\.app\/profile\/([^/?]+)/);
  if (match) {
    return match[1];
  }
  throw new Error("Invalid Bluesky profile URL format.");
};

const getRkeyFromUri = (uri) => {
  return uri.split("/").pop();
};

const getPostUrl = (authorDid, rkey) => {
  return `https://bsky.app/profile/${authorDid}/post/${rkey}`;
};

const sortByLikeCount = (a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0);

const getTemplate = (id) => {
  const template = document.getElementById(id);
  if (!template) throw new Error(`Template ${id} not found`);
  return template.content.cloneNode(true);
};

const renderPostActions = (post) => {
  const fragment = getTemplate("template-post-actions");
  fragment.querySelector("[data-like-count]").textContent = post.likeCount || 0;
  fragment.querySelector("[data-repost-count]").textContent = post.repostCount || 0;
  fragment.querySelector("[data-reply-count]").textContent = post.replyCount || 0;
  return fragment;
};

const renderCommentContainer = (post) => {
  const author = post.author;
  const rkey = getRkeyFromUri(post.uri);
  const postUrl = getPostUrl(author.did, rkey);
  
  const fragment = getTemplate("template-comment-container");
  const links = fragment.querySelectorAll("[data-post-url]");
  links.forEach(link => {
    link.href = postUrl;
  });
  fragment.querySelector("[data-avatar]").src = author.avatar;
  fragment.querySelector("[data-avatar]").alt = `${author.displayName}'s avatar`;
  fragment.querySelector("[data-display-name]").textContent = author.displayName;
  fragment.querySelector("[data-text]").textContent = post.record?.text || "";
  
  // Add post actions
  const actionsContainer = fragment.querySelector(".comment-container > div");
  actionsContainer.appendChild(renderPostActions(post));
  
  return fragment;
};

const renderComment = (post) => {
  const fragment = getTemplate("template-comment");
  const containerPlaceholder = fragment.querySelector("[data-comment-container]");
  const commentContainer = renderCommentContainer(post);
  containerPlaceholder.replaceWith(commentContainer.querySelector(".comment-container"));
  return fragment;
};

const renderThread = (thread) => {
  const fragment = renderComment(thread.post);
  const repliesContainer = fragment.querySelector("[data-replies]");
  
  const replies = thread.replies
    .sort(sortByLikeCount)
    .slice(0, 3)
    .map((reply) => renderComment(reply.post));
  
  if (replies.length > 0) {
    replies.forEach(reply => {
      repliesContainer.appendChild(reply);
    });
  } else {
    repliesContainer.remove();
  }
  
  return fragment;
};

const renderCommentsHeader = (postUrl) => {
  const fragment = getTemplate("template-comments-header");
  fragment.querySelector("[data-post-url]").href = postUrl;
  return fragment;
};

const renderErrorMessage = (message) => {
  const fragment = getTemplate("template-error-message");
  fragment.querySelector("[data-message]").textContent = message;
  return fragment;
};

const renderReplyLink = (postUrl) => {
  const fragment = getTemplate("template-reply-link");
  fragment.querySelector("[data-post-url]").href = postUrl;
  return fragment;
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
      const replies = (thread.replies || []).sort(sortByLikeCount);

      // Add main post actions if element exists
      const mainPostActions = document.getElementById("main-post-actions");
      if (mainPostActions) {
        mainPostActions.innerHTML = "";
        mainPostActions.appendChild(renderPostActions(thread.post));
      }

      // Append top 25 comments
      replies.slice(0, 25).forEach(reply => {
        container.appendChild(renderThread(reply));
      });

      // Add "Show More" button if there are more comments
      if (replies.length > 25 && !container.querySelector("#see-more")) {
        const postUrl =
          originalUrl ||
          getPostUrl(thread.post.author.did, getRkeyFromUri(uri));
        container.appendChild(renderReplyLink(postUrl));
      }
    })
    .catch((error) => {
      console.error("Error loading thread:", error);
      container.innerHTML = "";
      container.appendChild(renderErrorMessage("Error loading comments."));
    });
};

const init = () => {
  const container = document.getElementById("comments");

  if (!container) return;

  // Priority 1: Use Bluesky metadata if set
  if (container.dataset.uri) {
    const uri = convertToAtUri(container.dataset.uri);
    // Add initial content for metadata case
    const replyLink = document.createElement("p");
    const link = document.createElement("a");
    link.href = container.dataset.uri;
    link.target = "_blank";
    link.textContent = "Reply on Bluesky";
    replyLink.appendChild(link);
    container.appendChild(replyLink);
    loadThread(uri, container, container.dataset.uri);
  }
  // Priority 2: Auto-discover using author search
  else if (
    container.dataset.autoDiscover === "true" &&
    container.dataset.author
  ) {
    // Add loading message
    const loadingMsg = document.createElement("p");
    loadingMsg.textContent = "Loading comments...";
    container.appendChild(loadingMsg);

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
          const rkey = getRkeyFromUri(uri);
          const postUrl = getPostUrl(post.author.did, rkey);

          // Update container with comments header
          container.innerHTML = "";
          container.appendChild(renderCommentsHeader(postUrl));

          // Add main post actions element
          const mainPostActions = document.createElement("a");
          mainPostActions.id = "main-post-actions";
          mainPostActions.target = "_blank";
          mainPostActions.href = postUrl;
          container.appendChild(mainPostActions);

          // Load the thread
          loadThread(uri, container, postUrl);
        } else {
          container.innerHTML = "";
          container.appendChild(renderErrorMessage(
            "No Bluesky post found for this page."
          ));
        }
      } catch (err) {
        console.error("Error fetching post:", err);
        container.innerHTML = "";
        container.appendChild(renderErrorMessage(
          "Error searching for Bluesky post."
        ));
      }
    };

    fetchPost();
  }
  // Priority 3: Show error message if no author configured
  else if (container.dataset.error === "no-author") {
    const errorMsg = document.createElement("p");
    errorMsg.innerHTML = `Bluesky comments are not configured. Please set a <code>Bluesky</code> metadata field on this entry, or configure your Bluesky author handle in the plugin settings.`;
    container.appendChild(errorMsg);
  }
};

init();
