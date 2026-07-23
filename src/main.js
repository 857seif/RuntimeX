if (!window.__TAURI__) {
  document.getElementById("status").textContent =
    "Tauri API not available. Enable withGlobalTauri in tauri.conf.json.";
  throw new Error("window.__TAURI__ is undefined");
}

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const commonList = document.getElementById("common-list");
const specificList = document.getElementById("specific-list");
const specificTitle = document.getElementById("specific-title");
const archLabel = document.getElementById("arch-label");
const statusEl = document.getElementById("status");
const archSelect = document.getElementById("arch-select");
const content = document.getElementById("content");
const backBtn = document.getElementById("back-btn");

let appsData = null;

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

function showArch(arch) {
  commonList.innerHTML = "";
  specificList.innerHTML = "";

  archSelect.classList.add("hidden");
  content.classList.remove("hidden");
  archLabel.textContent = (arch === "x64" ? "64-bit" : "32-bit") + " selected";
  specificTitle.textContent = (arch === "x64" ? "64-bit" : "32-bit") + " Files";

  if (appsData.common.length === 0) {
    renderEmpty(commonList);
  } else {
    appsData.common.forEach((name) => renderItem(commonList, "common", name));
  }

  const list = appsData[arch] || [];
  if (list.length === 0) {
    renderEmpty(specificList);
  } else {
    list.forEach((name) => renderItem(specificList, arch, name));
  }
}

backBtn.addEventListener("click", () => {
  content.classList.add("hidden");
  archSelect.classList.remove("hidden");
  archLabel.textContent = "Choose your system type";
  statusEl.textContent = "";
});

document.querySelectorAll(".arch-btn").forEach((btn) => {
  btn.addEventListener("click", () => showArch(btn.dataset.arch));
});

async function init() {
  statusEl.textContent = "Loading list...";
  try {
    appsData = await invoke("fetch_apps");
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
