// Plugin JavaScript for analytics embed code
{{{appJS}}}

{{> heading.js}}
{{> pre-copy.js}}

class PageTransitioner {
  constructor(linkSelector, contentSelector) {
    this.linkSelector = linkSelector;
    this.contentSelector = contentSelector;
    this.pageCache = new Map();
    this.currentXHR = null;

    this.init();
  }

  init() {
    function isModified(e) {
      // Cmd (mac), Ctrl, Shift, Alt, or non-left mouse button
      return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
    }

    function isInternal(link) {
      if (!link || !link.href) return false;
      try {
        const linkURL = new URL(link.href, window.location.href);
        return linkURL.origin === window.location.origin;
      } catch {
        return false;
      }
    }

    function isSameDocumentHash(link) {
      if (!link || !link.href) return false;
      const linkURL = new URL(link.href, window.location.href);
      return (
        linkURL.origin === window.location.origin &&
        linkURL.pathname === window.location.pathname &&
        linkURL.hash.length > 1 // has a fragment
      );
    }

    // Hover prefetch: skip hashes
    document.addEventListener("mouseover", (e) => {
      const link = e.target.closest(this.linkSelector);
      if (isInternal(link) && !isSameDocumentHash(link))
        this.prefetch(link.href);
    });

    // Click nav: skip hashes
    document.addEventListener("click", (e) => {
      const link = e.target.closest(this.linkSelector);
      if (!link) return;

      // Let browser handle new-tab/window behavior and same-document hashes
      if (
        isModified(e) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;

      // Let the browser handle same-page anchors (footnotes/backrefs)
      if (isSameDocumentHash(link)) return;

      if (isInternal(link)) {
        e.preventDefault();
        link.blur();
        this.navigate(link.href);
      }
    });

    // Handle browser back/forward
    window.addEventListener("popstate", (e) => {
      if (e.state?.url) {
        this.navigate(e.state.url, false);
      }
    });
  }

  async prefetch(url) {
    if (this.pageCache.has(url)) return;

    try {
      const response = await fetch(url + "?partial=true");
      const text = await response.text();
      this.pageCache.set(url, text);
    } catch (err) {
      console.warn("Prefetch failed:", err);
    }
  }

  async navigate(url, pushState = true) {
    if (this.currentXHR) {
      this.currentXHR.abort();
    }

    const content = document.querySelector(this.contentSelector);

    if (!content) return;

    // clear the existing content
    content.innerHTML = '';
    content.classList.add("loading");
    document.documentElement.classList.add("is-loading");
    
    // close the mobile nav when a link is clicked
    document.querySelector('#toggle-left').checked = false;

    try {
      let html;

      if (this.pageCache.has(url)) {
        html = this.pageCache.get(url);
      } else {
        const controller = new AbortController();
        this.currentXHR = controller;

        const response = await fetch(url + "?partial=true", {
          signal: controller.signal,
        });
        html = await response.text();
        this.pageCache.set(url, html);
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const newContent = doc.querySelector(this.contentSelector);
      if (newContent) {

        content.innerHTML = newContent.innerHTML;
        document.title = doc.title;

        if (pushState) {
          history.pushState({ url }, "", url);
        }

        // Re-run scripts
        content.querySelectorAll("script").forEach((oldScript) => {
          const newScript = document.createElement("script");
          Array.from(oldScript.attributes).forEach((attr) => {
            newScript.setAttribute(attr.name, attr.value);
          });
          newScript.textContent = oldScript.textContent;
          oldScript.parentNode.replaceChild(newScript, oldScript);
        });

        // remove class 'active' from all links
        document.querySelectorAll(".sidebar a").forEach((link) => {
          link.classList.remove("active");
        });

        // add class 'active' to the current link
        document.querySelectorAll(".sidebar a").forEach((link) => {
          if (link.href === url) {
            link.classList.add("active");
            SidebarNavigation.saveCache();
          }
        });

        window.scrollTo(0, 0);
        renderHeadingAnchors();
        preCopy();
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Navigation failed:", err);
    } finally {
      content.classList.remove("loading");
      document.documentElement.classList.remove("is-loading");
      this.currentXHR = null;
    }
  }
}

// Initialize with your selectors
new PageTransitioner("a", "main");
