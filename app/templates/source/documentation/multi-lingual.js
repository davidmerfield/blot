document.addEventListener("DOMContentLoaded", renderMultiLingual);

function renderMultiLingual() {
  const STORAGE_KEY = 'preferredCodeLanguage';
  const codeBlocks = document.querySelectorAll("pre code");
  const codeGroups = [];
  let currentGroup = [];

  const getLanguage = (codeElement) => {
    return Array.from(codeElement.classList).find((cls) => cls !== "hljs");
  };

  const getStoredLanguage = () => {
    return localStorage.getItem(STORAGE_KEY);
  };

  const saveLanguagePreference = (lang) => {
    localStorage.setItem(STORAGE_KEY, lang);
  };

  codeBlocks.forEach((block, index) => {
    currentGroup.push(block.parentElement);

    const nextElement = block.parentElement.nextElementSibling;
    if (
      !nextElement?.querySelector("code") ||
      index === codeBlocks.length - 1
    ) {
      if (currentGroup.length >= 1) {
        codeGroups.push([...currentGroup]);
      }
      currentGroup = [];
    }
  });

  codeGroups.forEach((group) => {
    const wrapper = document.createElement("div");
    wrapper.className = "code-group";

    const toolbarContainer = document.createElement("div");
    toolbarContainer.className = "code-toolbar";

    const tabsContainer = document.createElement("div");
    tabsContainer.className = "code-tabs";

    const languages = [
      ...new Set(
        group.map((pre) => getLanguage(pre.firstElementChild)).filter(Boolean)
      ),
    ];

    const storedLanguage = getStoredLanguage();
    // Determine which language to show initially
    const initialLang = languages.includes(storedLanguage) ? storedLanguage : languages[0];

    if (languages.length === 1) {
      const label = document.createElement("span");
      label.className = "code-tab";
      label.textContent = languages[0];
      tabsContainer.appendChild(label);
    } else if (languages.length > 1) {
      languages.forEach((lang, i) => {
        const tab = document.createElement("button");
        tab.className = `code-tab ${lang === initialLang ? "active" : ""}`;
        tab.textContent = lang;
        tab.setAttribute("data-lang", lang);
        tabsContainer.appendChild(tab);
      });
    }

    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.innerHTML = `
            <span class="copy-icon">📋</span>
            <span class="copy-text">Copy</span>
          `;

    copyButton.addEventListener("click", () => {
      const activeBlock = wrapper.querySelector(
        ".code-block-wrapper.active code"
      );
      const textToCopy = activeBlock.textContent;

      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          copyButton.querySelector(".copy-text").textContent = "Copied!";
          setTimeout(() => {
            copyButton.querySelector(".copy-text").textContent = "Copy";
          }, 2000);
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
        });
    });

    toolbarContainer.appendChild(tabsContainer);
    toolbarContainer.appendChild(copyButton);

    group.forEach((pre, i) => {
      const lang = getLanguage(pre.firstElementChild);
      const blockWrapper = document.createElement("div");
      blockWrapper.className = `code-block-wrapper ${lang === initialLang ? "active" : ""}`;
      if (lang) {
        blockWrapper.setAttribute("data-lang", lang);
      }

      pre.parentNode.insertBefore(wrapper, pre);
      blockWrapper.appendChild(pre);
      wrapper.appendChild(blockWrapper);
    });

    wrapper.insertBefore(toolbarContainer, wrapper.firstChild);

    if (languages.length > 1) {
      tabsContainer.addEventListener("click", (e) => {
        if (e.target.classList.contains("code-tab")) {
          const lang = e.target.getAttribute("data-lang");
          
          saveLanguagePreference(lang);

          const allTabs = tabsContainer.querySelectorAll(".code-tab");
          const allBlocks = wrapper.querySelectorAll(".code-block-wrapper");

          allTabs.forEach((tab) => {
            tab.classList.toggle("active", tab === e.target);
          });

          allBlocks.forEach((block) => {
            block.classList.toggle(
              "active",
              block.getAttribute("data-lang") === lang
            );
          });

          document.querySelectorAll(".code-group").forEach((otherGroup) => {
            if (otherGroup !== wrapper) {
              const otherGroupLangs = Array.from(
                otherGroup.querySelectorAll(".code-block-wrapper")
              ).map(block => block.getAttribute("data-lang"));
              
              // If the selected language exists in this group, switch to it
              // Otherwise, switch to the first language in the group
              const targetLang = otherGroupLangs.includes(lang) ? lang : otherGroupLangs[0];
              
              const matchingTab = otherGroup.querySelector(
                `.code-tab[data-lang="${targetLang}"]`
              );
              if (matchingTab && !matchingTab.classList.contains("active")) {
                matchingTab.click();
              }
            }
          });
        }
      });
    }
  });

  const storedLang = getStoredLanguage();
  if (storedLang) {
    document.querySelectorAll(".code-group").forEach(group => {
      const groupLangs = Array.from(
        group.querySelectorAll(".code-block-wrapper")
      ).map(block => block.getAttribute("data-lang"));
      
      // If the stored language exists in this group, switch to it
      // Otherwise, switch to the first language in the group
      const targetLang = groupLangs.includes(storedLang) ? storedLang : groupLangs[0];
      
      const targetTab = group.querySelector(`.code-tab[data-lang="${targetLang}"]`);
      if (targetTab && !targetTab.classList.contains('active')) {
        targetTab.click();
      }
    });
  }
}