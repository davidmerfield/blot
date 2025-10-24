const withAjax = (url) => {
  try {
    const target = new URL(url, window.location.href);
    target.searchParams.set("ajax", "true");
    return target.toString();
  } catch (err) {
    return url.indexOf("?") === -1 ? url + "?ajax=true" : url + "&ajax=true";
  }
};

const refreshTemplatePreview = () => {
  const previewFrame = document.getElementById("full_size_preview");

  if (previewFrame) {
    console.log("refreshing preview");
    previewFrame.src += "";
  } else {
    console.log("no preview frame to refresh");
  }
};

const handleAjaxSaveResponse = (response) => {
  const forked =
    response && response.headers && response.headers.get("X-Template-Forked");

  if (forked === "1") {
    window.location.reload();
    return response;
  }

  refreshTemplatePreview();
  return response;
};

module.exports = {
  withAjax,
  handleAjaxSaveResponse,
};
