(function () {
  var container = document.getElementById("post-mentions");
  var list = document.getElementById("mentions-list");

  if (!container || !list) return;

  var postUrl = window.location.href.split("#")[0];
  var fallbackAvatar = "https://www.gravatar.com/avatar/?d=mp&f=y";

  function safeUrl(value) {
    if (typeof value !== "string") return null;
    var trimmed = value.trim();
    if (!trimmed) return null;

    try {
      var parsed = new URL(trimmed, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  function safeContent(content) {
    if (!content) return "";

    var raw = "";
    if (typeof content === "string") {
      raw = content;
    } else if (typeof content === "object") {
      if (typeof content.html === "string" && content.html.trim()) {
        raw = content.html;
      } else if (typeof content.text === "string") {
        var textWrapper = document.createElement("div");
        textWrapper.textContent = content.text;
        return textWrapper.innerHTML;
      }
    }

    if (!raw) return "";

    var template = document.createElement("template");
    template.innerHTML = raw;

    var allowedTags = {
      A: true,
      EM: true,
      STRONG: true,
      P: true,
      BR: true,
      SPAN: true,
      CODE: true,
      BLOCKQUOTE: true,
      UL: true,
      OL: true,
      LI: true,
    };

    var walker = document.createTreeWalker(
      template.content,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    var toRemove = [];

    while (walker.nextNode()) {
      var el = walker.currentNode;
      if (!allowedTags[el.tagName]) {
        toRemove.push(el);
        continue;
      }

      for (var i = el.attributes.length - 1; i >= 0; i--) {
        var attr = el.attributes[i];
        if (el.tagName === "A" && attr.name === "href") {
          var href = safeUrl(attr.value);
          if (href) {
            el.setAttribute("href", href);
            el.setAttribute("rel", "nofollow noopener");
            el.setAttribute("target", "_blank");
          } else {
            el.removeAttribute("href");
          }
        } else {
          el.removeAttribute(attr.name);
        }
      }
    }

    for (var j = 0; j < toRemove.length; j++) {
      var node = toRemove[j];
      var text = node.textContent || "";
      node.replaceWith(document.createTextNode(text));
    }

    return template.innerHTML;
  }

  function createAvatar(author, fallbackUrl, size, linkUrl) {
    var photo = safeUrl(author && author.photo) || fallbackUrl;
    var profileUrl = safeUrl((author && author.url) || linkUrl);
    var name =
      (author && author.name) ||
      (profileUrl ? profileUrl.replace(/^https?:\/\//, "") : "Someone");

    var img = document.createElement("img");
    img.className = "u-photo";
    img.loading = "lazy";
    img.width = size;
    img.height = size;
    img.src = photo || fallbackUrl;
    img.alt = name;
    img.title = name;

    if (profileUrl) {
      var link = document.createElement("a");
      link.href = profileUrl;
      link.target = "_blank";
      link.rel = "nofollow noopener";
      link.appendChild(img);
      return link;
    }

    return img;
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    var month = String(date.getUTCMonth() + 1);
    var day = String(date.getUTCDate());
    var year = String(date.getUTCFullYear());

    return month + "/" + day + "/" + year;
  }

  function handleData(data) {
    if (!data || !Array.isArray(data.links) || data.links.length === 0) {
      return;
    }

    var groups = {
      link: [],
      repost: [],
      like: [],
    };

    var hasMentions = false;

    data.links.forEach(function (item) {
      var activity = item && item.activity ? item.activity.type : null;
      var entry = item && item.data ? item.data : {};
      var author = entry.author || {};

      if (activity === "reply") {
        var li = document.createElement("li");
        li.className = "mention";

        var authorDiv = document.createElement("div");
        authorDiv.className = "mention-author u-author";

        var avatarNode = createAvatar(author, fallbackAvatar, 40, entry.url);
        authorDiv.appendChild(avatarNode);

        var profileUrl = safeUrl(author && author.url);
        var nameText =
          (author && author.name) ||
          (profileUrl ? profileUrl.replace(/^https?:\/\//, "") : "Someone");

        if (profileUrl) {
          var authorLink = document.createElement("a");
          authorLink.href = profileUrl;
          authorLink.target = "_blank";
          authorLink.rel = "nofollow noopener";
          authorLink.textContent = nameText;
          authorDiv.appendChild(authorLink);
        } else {
          var authorName = document.createElement("span");
          authorName.textContent = nameText;
          authorDiv.appendChild(authorName);
        }

        authorDiv.appendChild(document.createTextNode(" replied"));
        li.appendChild(authorDiv);

        var mentionContent = entry.content ? safeContent(entry.content) : "";
        if (mentionContent) {
          var textDiv = document.createElement("div");
          textDiv.className = "mention-text";
          textDiv.innerHTML = mentionContent;
          li.appendChild(textDiv);
        }

        var meta = document.createElement("span");
        meta.className = "mention-meta small";

        var timeEl = document.createElement("time");
        timeEl.dateTime = item.verified_date || "";
        timeEl.textContent = formatDate(item.verified_date);
        meta.appendChild(timeEl);

        var permalink = safeUrl(entry.url);
        if (permalink) {
          var arrow = document.createElement("a");
          arrow.href = permalink;
          arrow.target = "_blank";
          arrow.rel = "nofollow noopener";
          arrow.textContent = "→";
          meta.appendChild(arrow);
        }

        li.appendChild(meta);

        list.insertBefore(li, list.firstChild);
        hasMentions = true;
        return;
      }

      if (activity === "link" || activity === "repost" || activity === "like") {
        var avatar = createAvatar(author, fallbackAvatar, 36, entry.url);
        groups[activity].push({ node: avatar });
      }
    });

    [
      { key: "link", label: "🔗 linked to this." },
      { key: "repost", label: "♻️ reposted this." },
      { key: "like", label: "👍 liked this." },
    ].forEach(function (group) {
      var entries = groups[group.key];
      if (!entries || entries.length === 0) return;

      var li = document.createElement("li");
      li.className = "mention-social";

      entries.forEach(function (entry) {
        var node = entry.node;
        li.appendChild(node);
      });

      var text = document.createElement("span");
      text.className = "mention-social__text";
      text.textContent = " " + group.label;
      li.appendChild(text);

      list.insertBefore(li, list.firstChild);
      hasMentions = true;
    });

    if (hasMentions) {
      container.hidden = false;
    }
  }

  function fetchMentions() {
    var params = new URLSearchParams();
    params.set("per-page", "50");
    params.set("page", "0");
    params.set("target", postUrl);

    var url = "https://webmention.io/api/mentions?" + params.toString();

    return fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "omit",
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Request failed");
        return response.json();
      })
      .then(function (data) {
        handleData(data);
      });
  }

  function fetchViaJsonp() {
    return new Promise(function (resolve) {
      var callbackName = "_blotWebmention" + Math.random().toString(36).slice(2);

      var params = new URLSearchParams();
      params.set("per-page", "50");
      params.set("page", "0");
      params.set("target", postUrl);
      params.set("jsonp", callbackName);

      var script = document.createElement("script");
      script.src = "https://webmention.io/api/mentions?" + params.toString();
      script.async = true;

      function cleanup() {
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function (data) {
        cleanup();
        handleData(data);
        resolve();
      };

      script.onerror = function () {
        cleanup();
        resolve();
      };

      document.body.appendChild(script);
    });
  }

  if (!window.fetch) {
    fetchViaJsonp();
  } else {
    fetchMentions().catch(function () {
      fetchViaJsonp();
    });
  }
})();
