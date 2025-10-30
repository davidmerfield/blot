const $ = require("../../../js/jquery.js");

if (typeof window !== "undefined") {
  window.$ = window.jQuery = $;
}

const codeMirrorModule = require("./codemirror/codemirror.js");
const CodeMirror =
  (codeMirrorModule && codeMirrorModule.default) ||
  codeMirrorModule ||
  (typeof window !== "undefined" ? window.CodeMirror : undefined);

if (typeof window !== "undefined" && CodeMirror) {
  window.CodeMirror = CodeMirror;
}

require("./codemirror/active-line.js");
require("./codemirror/mode-css.js");
require("./codemirror/mode-simple.js");
require("./codemirror/mode-multiplex.js");
require("./codemirror/mode-handlebars.js");
require("./codemirror/mode-htmlmixed.js");
require("./codemirror/mode-javascript.js");
require("./codemirror/mode-xml.js");

function initializeSourceEditor() {
  if (typeof window === "undefined" || !window.document || !CodeMirror) {
    return;
  }

  var sourceElement = document.getElementById("source");
  if (!sourceElement) {
    return;
  }

  var $source = $(sourceElement);
  var $saveButton = $("#save");
  var $form = $(".save");

  $source.hide();

  var editor = CodeMirror.fromTextArea(sourceElement, {
    mode: { name: "handlebars", base: $source.attr("data-mode") },
    lineNumbers: true,
    smartIndent: false,
    styleActiveLine: true,
    theme: "default",
  });

  function handleSave(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    if ($saveButton.hasClass("disabled")) {
      return false;
    }

    $saveButton.addClass("working").addClass("disabled").val("Saving");

    $('input[name="content"]').val(editor.getValue());

    $saveButton.text("Saving changes");

    $.ajax({
      type: "POST",
      url: $form.attr("action"),
      data: $form.serialize(),
      error: function (res) {
        $saveButton
          .text("Save changes")
          .removeClass("working")
          .removeClass("disabled")
          .prop("disabled", false)
          .val("Save");

        $(".error").text(res.responseText).fadeIn();
      },
      success: function () {
        $saveButton
          .addClass("disabled")
          .prop("disabled", true)
          .removeClass("working")
          .val("Saved!");

        $saveButton.text("Saved");

        $(".error").hide();

        setTimeout(function () {
          $(".success").fadeOut();
        }, 3000);
      },
    });

    return false;
  }

  $form.submit(handleSave);

  editor.on("keydown", function (mirror, event) {
    if (
      event.keyCode === 83 &&
      (navigator.platform.match("Mac") ? event.metaKey : event.ctrlKey)
    ) {
      event.preventDefault();
      $form.submit();
    } else {
      $saveButton
        .removeClass("disabled")
        .text("Save changes")
        .prop("disabled", false)
        .val("Save");
    }
  });
}

document.addEventListener("DOMContentLoaded", initializeSourceEditor);
