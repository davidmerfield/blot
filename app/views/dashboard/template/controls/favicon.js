const form = document.querySelector("[data-favicon-form]");

if (form) {
  const input = form.querySelector("[data-favicon-input]");
  const cropper = form.querySelector("[data-favicon-cropper]");
  const image = form.querySelector("[data-favicon-image]");
  const selection = form.querySelector("[data-favicon-selection]");
  const previews = form.querySelector("[data-favicon-previews]");
  const fields = {
    x: form.querySelector("[data-favicon-crop-x]"),
    y: form.querySelector("[data-favicon-crop-y]"),
    size: form.querySelector("[data-favicon-crop-size]"),
  };
  let crop;
  let drag;

  const limit = (value, min, max) => Math.min(max, Math.max(min, value));
  const dimensions = () => ({ width: image.clientWidth, height: image.clientHeight });
  const writeCrop = () => {
    const { width, height } = dimensions();
    selection.style.left = `${crop.left}px`;
    selection.style.top = `${crop.top}px`;
    selection.style.width = `${crop.side}px`;
    selection.style.height = `${crop.side}px`;
    fields.x.value = crop.left / width;
    fields.y.value = crop.top / height;
    fields.size.value = crop.side / Math.min(width, height);
  };
  const point = (event) => {
    const rect = image.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    image.onload = () => {
      const { width, height } = dimensions();
      const side = Math.min(width, height);
      crop = { left: (width - side) / 2, top: (height - side) / 2, side };
      cropper.hidden = false;
      previews.hidden = false;
      for (const preview of previews.querySelectorAll("img")) preview.src = image.src;
      writeCrop();
    };
    image.src = URL.createObjectURL(file);
  });

  selection.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const rect = selection.getBoundingClientRect();
    const resizing = event.clientX >= rect.right - 24 && event.clientY >= rect.bottom - 24;
    drag = { mode: resizing ? "resize" : "move", start: point(event), crop: { ...crop } };
    selection.setPointerCapture(event.pointerId);
  });
  selection.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const { width, height } = dimensions();
    const now = point(event);
    const dx = now.x - drag.start.x;
    const dy = now.y - drag.start.y;
    if (drag.mode === "move") {
      crop.left = limit(drag.crop.left + dx, 0, width - crop.side);
      crop.top = limit(drag.crop.top + dy, 0, height - crop.side);
    } else {
      const side = limit(drag.crop.side + Math.max(dx, dy), 24, Math.min(width - crop.left, height - crop.top));
      crop.side = side;
    }
    writeCrop();
  });
  selection.addEventListener("pointerup", () => { drag = null; });
}
