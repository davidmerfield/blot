// we want to preserve the scroll offset whenever a link is clicked in the template list
// the parent container of the links on this page is:
// <div id="template-list" style="overflow-y: scroll;width: 100%;height: 100%;padding-right: 17px;">
var template_list = document.getElementById("template-list");

if (template_list) {
  var scroll_offset = sessionStorage.getItem("scroll_offset");
  if (scroll_offset) {
    template_list.scrollTop = scroll_offset;
  }

  // whenever the user scrolls the template list, save the scroll offset
  template_list.addEventListener("scroll", function () {
    sessionStorage.setItem("scroll_offset", template_list.scrollTop);
  });

  var templateActionMenu = document.getElementById("template-action-menu");
  var templateActionMenuLinks = templateActionMenu
    ? {
        settings: templateActionMenu.querySelector(
          '[data-menu-link="settings"]'
        ),
        use: templateActionMenu.querySelector('[data-menu-link="use"]'),
        source: templateActionMenu.querySelector('[data-menu-link="source"]'),
        rename: templateActionMenu.querySelector('[data-menu-link="rename"]'),
        duplicate: templateActionMenu.querySelector('[data-menu-link="duplicate"]'),
        delete: templateActionMenu.querySelector('[data-menu-link="delete"]'),
      }
    : null;

  var activeTemplateRow = null;
  var activeTemplateTrigger = null;

  function closeTemplateMenu() {
    if (
      !templateActionMenu ||
      !templateActionMenu.classList.contains("is-open")
    )
      return;
    templateActionMenu.classList.remove("is-open");
    templateActionMenu.setAttribute("aria-hidden", "true");
    if (activeTemplateRow) {
      activeTemplateRow.classList.remove("menu-open");
    }
    if (activeTemplateTrigger) {
      activeTemplateTrigger.setAttribute("aria-expanded", "false");
    }
    activeTemplateRow = null;
    activeTemplateTrigger = null;
  }

  function positionTemplateMenu(row) {
    if (!templateActionMenu) return;
    var offsetTop = row.offsetTop;
    if (template_list) {
      offsetTop -= template_list.scrollTop;
    }
    templateActionMenu.style.top = offsetTop + "px";
  }

  function updateTemplateMenu(trigger) {
    if (!templateActionMenuLinks) return;

    var baseUrl = trigger.getAttribute("data-editurl");
    if (baseUrl) {
      baseUrl = baseUrl.replace(/\/+$/, "");
    }

    templateActionMenuLinks.settings.href = baseUrl || "#";
    templateActionMenuLinks.use.href = baseUrl ? baseUrl + "/install" : "#";
    templateActionMenuLinks.source.href = baseUrl
      ? baseUrl + "/source-code"
      : "#";
    templateActionMenuLinks.rename.href = baseUrl ? baseUrl + "/rename" : "#";
    templateActionMenuLinks.delete.href = baseUrl ? baseUrl + "/delete" : "#";
    templateActionMenuLinks.duplicate.href = baseUrl ? baseUrl + "/duplicate" : "#";
  }

  function openTemplateMenu(row, trigger) {
    if (!templateActionMenu) return;

    if (activeTemplateRow && activeTemplateRow !== row) {
      activeTemplateRow.classList.remove("menu-open");
    }
    updateTemplateMenu(trigger);
    positionTemplateMenu(row);
    templateActionMenu.classList.add("is-open");
    templateActionMenu.setAttribute("aria-hidden", "false");
    row.classList.add("menu-open");
    activeTemplateRow = row;
    activeTemplateTrigger = trigger;
    activeTemplateTrigger.setAttribute("aria-expanded", "true");
    if (templateActionMenuLinks) {
      window.requestAnimationFrame(function () {
        templateActionMenuLinks.settings.focus();
      });
    }
  }

  template_list.addEventListener("click", function (event) {
    var trigger = event.target.closest(".template-row__menu-trigger");
    if (!trigger || !templateActionMenu) return;

    event.preventDefault();
    event.stopPropagation();

    var row = trigger.closest(".template-row");
    if (!row) return;

    if (
      row === activeTemplateRow &&
      templateActionMenu.classList.contains("is-open")
    ) {
      closeTemplateMenu();
      return;
    }

    openTemplateMenu(row, trigger);
  });

  template_list.addEventListener("scroll", function () {
    if (activeTemplateRow) {
      positionTemplateMenu(activeTemplateRow);
    }
  });

  window.addEventListener("resize", function () {
    if (activeTemplateRow) {
      positionTemplateMenu(activeTemplateRow);
    }
  });

  document.addEventListener("click", function (event) {
    if (!templateActionMenu) return;
    if (!templateActionMenu.contains(event.target)) {
      closeTemplateMenu();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeTemplateMenu();
      if (activeTemplateTrigger) {
        activeTemplateTrigger.focus();
      }
    }
  });

  if (templateActionMenu) {
    templateActionMenu.addEventListener("click", function (event) {
      event.stopPropagation();
      if (event.target.tagName === "A") {
        closeTemplateMenu();
      }
    });

    templateActionMenu.addEventListener("focusout", function () {
      window.requestAnimationFrame(function () {
        if (
          document.activeElement !== activeTemplateTrigger &&
          !templateActionMenu.contains(document.activeElement)
        ) {
          closeTemplateMenu();
        }
      });
    });
  }

  // when the page loads, scroll to the last scroll offset
  window.addEventListener("DOMContentLoaded", function () {
    // whenever the <form action="{{{base}}}/install" is submitted, remove the scroll offset
    var install_form = document.querySelector(
      'form[action="{{{base}}}/install"]'
    );
    if (install_form) {
      install_form.addEventListener("submit", function () {
        sessionStorage.removeItem("scroll_offset");
      });
    }
  });
}
