const dropzone = document.querySelector("#dropzone");
const fileInput = document.querySelector("#file-input");
const browseButton = document.querySelector("#browse-button");
const statusPanel = document.querySelector("#upload-status");
const statusMessage = document.querySelector("#status-message");
const progressRow = document.querySelector("#progress-row");
const progressTrack = document.querySelector("#progress-track");
const progressFill = document.querySelector("#progress-fill");
const progressValue = document.querySelector("#progress-value");
const gallery = document.querySelector("#gallery");
const emptyState = document.querySelector("#empty-state");
const imageCount = document.querySelector("#image-count");
const dimensions = document.querySelector("#dimensions");

const acceptedTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const acceptedExtensions = /\.(jpe?g|png|webp)$/i;
const maxFiles = 20;

function isAcceptedImage(file) {
  return (
    acceptedTypes.has(file.type) ||
    (!file.type && acceptedExtensions.test(file.name))
  );
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Could not load resize settings.");
    const config = await response.json();
    dimensions.textContent = `${config.width} × ${config.height} px`;
  } catch (error) {
    dimensions.textContent = "Size unavailable";
    showStatus(error.message, "error");
  }
}

function showStatus(message, state = "") {
  statusPanel.hidden = false;
  statusPanel.className = `upload-status${state ? ` is-${state}` : ""}`;
  statusMessage.textContent = message;
}

function setProgress(percent) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  progressRow.hidden = false;
  progressTrack.setAttribute("aria-valuenow", String(value));
  progressFill.style.width = `${value}%`;
  progressValue.textContent = `${value}%`;
}

function hideProgress() {
  progressRow.hidden = true;
  progressFill.style.width = "0%";
  progressTrack.setAttribute("aria-valuenow", "0");
  progressValue.textContent = "0%";
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function uploadWithProgress(data, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100);
      }
    });
    request.upload.addEventListener("load", () => {
      onProgress(100);
    });
    request.addEventListener("load", () => {
      const result = request.response || {};
      if (request.status >= 200 && request.status < 300) {
        resolve(result);
      } else {
        reject(new Error(result.error || "Upload failed."));
      }
    });
    request.addEventListener("error", () =>
      reject(new Error("Could not reach the server.")),
    );
    request.addEventListener("abort", () =>
      reject(new Error("Upload cancelled.")),
    );
    request.send(data);
  });
}

function renderImages(images) {
  gallery.replaceChildren();
  imageCount.textContent = images.length;

  if (images.length === 0) {
    gallery.append(emptyState);
    return;
  }

  for (const image of images) {
    const item = document.createElement("figure");
    item.className = "image-item";

    const link = document.createElement("a");
    link.href = image.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.setAttribute("aria-label", `Open ${image.name}`);

    const preview = document.createElement("img");
    preview.src = image.url;
    preview.alt = image.name;
    preview.loading = "lazy";
    link.append(preview);

    const caption = document.createElement("figcaption");
    caption.textContent = image.name;
    item.append(link, caption);
    gallery.append(item);
  }
}

async function loadImages() {
  const response = await fetch("/api/uploads");
  if (!response.ok) throw new Error("Could not load your image library.");
  renderImages(await response.json());
}

function collectImages(fileList) {
  const images = [...fileList].filter(isAcceptedImage);
  if (images.length === 0) {
    showStatus("Choose JPG, PNG, or WebP images.", "error");
    hideProgress();
    return [];
  }
  if (images.length > maxFiles) {
    showStatus(`You can upload up to ${maxFiles} images at once.`, "error");
    hideProgress();
    return [];
  }
  return images;
}

async function uploadFiles(fileList) {
  const files = collectImages(fileList);
  if (files.length === 0) return;

  const progressStartedAt = performance.now();
  const label =
    files.length === 1
      ? `Uploading ${files[0].name}…`
      : `Uploading ${files.length} images…`;

  statusPanel.hidden = false;
  setProgress(0);
  showStatus(label, "busy");

  // Let the browser paint the progress UI before the request starts.
  await nextFrame();
  await nextFrame();

  const data = new FormData();
  for (const file of files) {
    data.append("images", file);
  }

  try {
    const result = await uploadWithProgress(data, (percent) => {
      setProgress(percent);
      showStatus(label, "busy");
    });

    setProgress(100);
    showStatus(
      files.length === 1
        ? "Upload complete. Resizing image…"
        : "Upload complete. Resizing images…",
      "busy",
    );

    const visibleFor = performance.now() - progressStartedAt;
    if (visibleFor < 600) {
      await new Promise((resolve) => setTimeout(resolve, 600 - visibleFor));
    }

    hideProgress();
    const saved = result.files || [];
    const sizeNote = `${result.width} × ${result.height} px`;
    showStatus(
      saved.length === 1
        ? `Saved ${saved[0].name} at ${sizeNote}.`
        : `Saved ${saved.length} images at ${sizeNote}.`,
      "success",
    );
    await loadImages();
  } catch (error) {
    hideProgress();
    showStatus(error.message, "error");
  } finally {
    fileInput.value = "";
  }
}

browseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  fileInput.click();
});

dropzone.addEventListener("click", (event) => {
  if (event.target !== browseButton) fileInput.click();
});

dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => uploadFiles(fileInput.files));

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-over");
  });
}

dropzone.addEventListener("drop", (event) => {
  uploadFiles(event.dataTransfer.files);
});

loadConfig();
loadImages().catch((error) => showStatus(error.message, "error"));
