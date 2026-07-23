const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const commonList = document.getElementById("common-list");
const specificList = document.getElementById("specific-list");
const archLabel = document.getElementById("arch-label");
const statusEl = document.getElementById("status");

function safeId(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

function renderItem(container, category, name) {
  const row = document.createElement("div");
  row.className = "item";

  const nameSpan = document.createElement("span");
  nameSpan.className = "item-name";
  nameSpan.textContent = name;

  const progressSpan = document.createElement("span");
  progressSpan.className = "item-progress";
  progressSpan.id = "p-" + safeId(category + name);

  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "Download";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Working...";
    try {
      await invoke("download_item", { category, name });
      btn.textContent = "Done";
      btn.classList.add("done");
      progressSpan.textContent = "";
    } catch (e) {
      btn.textContent = "Retry";
      btn.classList.add("error");
      btn.disabled = false;
      statusEl.textContent = String(e);
    }
  });

  row.appendChild(nameSpan);
  row.appendChild(progressSpan);
  row.appendChild(btn);
  container.appendChild(row);
}

function renderEmpty(container) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = "No items";
  container.appendChild(p);
}

async function init() {
  statusEl.textContent = "Loading list...";
  try {
    const data = await invoke("fetch_apps");

    archLabel.textContent =
      "Detected " + (data.arch === "x64" ? "64-bit" : "32-bit") + " system";

    if (data.common.length === 0) {
      renderEmpty(commonList);
    } else {
      data.common.forEach((name) => renderItem(commonList, "common", name));
    }

    if (data.specific.length === 0) {
      renderEmpty(specificList);
    } else {
      data.specific.forEach((name) =>
        renderItem(specificList, data.arch, name)
      );
    }

    statusEl.textContent = "";
  } catch (e) {
    statusEl.textContent = "Failed to load list: " + e;
  }
}

listen("download-progress", (event) => {
  const { name, percent } = event.payload;
  document.querySelectorAll('[id^="p-"]').forEach((el) => {
    if (el.id.endsWith(safeId(name))) {
      el.textContent = percent + "%";
    }
  });
});

init();
