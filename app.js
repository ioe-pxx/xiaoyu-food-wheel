(function () {
  "use strict";

  const Core = window.FoodWheelCore;
  const APPEARANCE_STORAGE_KEY = "xiaoyu-food-wheel-appearance-v1";
  const DEFAULT_WORKSPACE_NAME = "小语今天吃什么";
  const MAX_WORKSPACE_NAME_LENGTH = 24;
  const MAX_BACKGROUND_SOURCE_BYTES = 12 * 1024 * 1024;
  const MAX_BACKGROUND_DATA_URL_LENGTH = 920000;
  const palette = ["#85c7e8", "#ffd7e6", "#fff0b8", "#a9dfcf", "#b9d8f4", "#f6bed5", "#d9e7a8", "#f7c7a5"];
  const labelColors = ["#294a60", "#683f51", "#5f4a1c", "#31584f", "#304e68", "#663b50", "#415327", "#67442f"];
  const storage = window.localStorage;
  const cryptoObject = window.crypto;
  let state = Core.loadState(storage, cryptoObject);
  let appearance = loadAppearance();
  let wheel = null;
  let spinning = false;
  let pendingWinner = null;
  let deletedEntry = null;
  let toastTimer = null;
  let appearanceDraftBackground = appearance.background;

  const $ = (selector) => document.querySelector(selector);
  const wheelElement = $("#wheel");
  const wheelEmpty = $("#wheelEmpty");
  const spinButton = $("#spinButton");
  const candidateCount = $("#candidateCount");
  const manageDialog = $("#manageDialog");
  const appearanceDialog = $("#appearanceDialog");
  const resultDialog = $("#resultDialog");
  const entryList = $("#entryList");
  const addForm = $("#addForm");
  const entryInput = $("#entryInput");
  const formMessage = $("#formMessage");
  const toast = $("#toast");
  const toastMessage = $("#toastMessage");
  const undoButton = $("#undoButton");

  function normalizeWorkspaceName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function isStoredBackground(value) {
    return typeof value === "string" && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value) && value.length <= MAX_BACKGROUND_DATA_URL_LENGTH;
  }

  function normalizeAppearance(value) {
    const name = normalizeWorkspaceName(value && value.workspaceName);
    return {
      workspaceName: name && [...name].length <= MAX_WORKSPACE_NAME_LENGTH ? name : DEFAULT_WORKSPACE_NAME,
      background: isStoredBackground(value && value.background) ? value.background : null
    };
  }

  function loadAppearance() {
    try {
      return normalizeAppearance(JSON.parse(storage.getItem(APPEARANCE_STORAGE_KEY)));
    } catch (error) {
      return normalizeAppearance();
    }
  }

  function persistAppearance() {
    try {
      storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
      return true;
    } catch (error) {
      showToast("保存失败，请检查浏览器存储");
      return false;
    }
  }

  function applyAppearance(value = appearance) {
    const normalized = normalizeAppearance(value);
    $("#workspaceName").textContent = normalized.workspaceName;
    document.title = normalized.workspaceName;
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.content = normalized.workspaceName;
    if (normalized.background) document.documentElement.style.setProperty("--wheel-background", `url("${normalized.background}")`);
    else document.documentElement.style.removeProperty("--wheel-background");
    document.body.classList.toggle("has-custom-background", Boolean(normalized.background));
  }

  function setAppearanceMessage(message, isError = false) {
    const messageNode = $("#appearanceMessage");
    messageNode.textContent = message;
    messageNode.classList.toggle("error", isError);
  }

  function isSupportedImageFile(file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    return allowedTypes.includes(file.type) || (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
  }

  function compressBackground(file) {
    return new Promise((resolve, reject) => {
      const imageUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(imageUrl);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("canvas"));
        let scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
        let dataUrl = "";
        for (let pass = 0; pass < 6; pass += 1) {
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          for (let quality = 0.86; quality >= 0.46; quality -= 0.08) {
            dataUrl = canvas.toDataURL("image/jpeg", quality);
            if (dataUrl.length <= MAX_BACKGROUND_DATA_URL_LENGTH) return resolve(dataUrl);
          }
          scale *= 0.78;
        }
        reject(new Error("too-large"));
      };
      image.onerror = () => { URL.revokeObjectURL(imageUrl); reject(new Error("decode")); };
      image.src = imageUrl;
    });
  }

  function openAppearance() {
    appearanceDraftBackground = appearance.background;
    $("#appearanceName").value = appearance.workspaceName;
    $("#backgroundFile").value = "";
    $("#backgroundFileName").textContent = appearanceDraftBackground ? "已选择自定义背景" : "使用默认背景";
    setAppearanceMessage("");
    if (!appearanceDialog.open) appearanceDialog.showModal();
  }

  function closeAppearance() {
    applyAppearance();
    closeDialog(appearanceDialog);
  }

  async function handleBackgroundSelection(file) {
    if (!file) return;
    if (!isSupportedImageFile(file)) return setAppearanceMessage("请选择 JPG、PNG、WebP 或 HEIC 图片", true);
    if (file.size > MAX_BACKGROUND_SOURCE_BYTES) return setAppearanceMessage("图片不能超过 12 MB", true);
    const fileInput = $("#backgroundFile");
    fileInput.disabled = true;
    setAppearanceMessage("正在压缩图片...");
    try {
      appearanceDraftBackground = await compressBackground(file);
      applyAppearance({ ...appearance, background: appearanceDraftBackground });
      $("#backgroundFileName").textContent = "已预览，保存后生效";
      setAppearanceMessage("图片已压缩，点击保存外观即可使用");
    } catch (error) {
      setAppearanceMessage("这张图片无法处理，请换一张后重试", true);
    } finally {
      fileInput.disabled = false;
    }
  }

  function saveAppearance(event) {
    event.preventDefault();
    const workspaceName = normalizeWorkspaceName($("#appearanceName").value);
    if (!workspaceName) return setAppearanceMessage("请输入轮盘名称", true);
    if ([...workspaceName].length > MAX_WORKSPACE_NAME_LENGTH) return setAppearanceMessage(`名称最多 ${MAX_WORKSPACE_NAME_LENGTH} 个字`, true);
    appearance = { workspaceName, background: appearanceDraftBackground };
    if (!persistAppearance()) return;
    applyAppearance();
    $("#backgroundFileName").textContent = appearanceDraftBackground ? "已选择自定义背景" : "使用默认背景";
    setAppearanceMessage("已保存到当前设备");
  }

  function renderIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
  }

  function wheelItems() {
    return state.entries.map((entry, index) => ({
      label: entry.name,
      backgroundColor: palette[index % palette.length],
      labelColor: labelColors[index % labelColors.length]
    }));
  }

  function createWheel() {
    if (!window.spinWheel || !window.spinWheel.Wheel) {
      wheelEmpty.hidden = false;
      wheelEmpty.querySelector("strong").textContent = "轮盘加载失败";
      return;
    }
    wheel = new window.spinWheel.Wheel(wheelElement, {
      items: wheelItems(),
      borderColor: "#ffffff",
      borderWidth: 5,
      lineColor: "rgba(255,255,255,.88)",
      lineWidth: 2,
      radius: 0.92,
      itemLabelFont: "ui-rounded, PingFang SC, Microsoft YaHei, sans-serif",
      itemLabelFontSizeMax: 25,
      itemLabelRadius: 0.72,
      itemLabelRadiusMax: 0.22,
      itemLabelRotation: 0,
      itemLabelAlign: "right",
      isInteractive: false,
      pointerAngle: 0,
      onRest: finishSpin
    });
  }

  function updateWheel() {
    if (wheel) wheel.items = wheelItems();
    const count = state.entries.length;
    candidateCount.textContent = count;
    wheelEmpty.hidden = count > 0;
    wheelElement.classList.toggle("hidden", count === 0);
    spinButton.disabled = spinning || count < 2;
    renderEntryList();
  }

  function renderEntryList() {
    entryList.innerHTML = state.entries.length ? state.entries.map((entry, index) => `
      <li>
        <span class="entry-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="entry-name"></span>
        <button type="button" data-delete-id="${entry.id}" aria-label="删除${escapeAttribute(entry.name)}" title="删除">
          <i data-lucide="trash-2" aria-hidden="true"></i>
        </button>
      </li>`).join("") : `<li class="empty-list"><i data-lucide="utensils" aria-hidden="true"></i><span>还没有候选</span></li>`;
    state.entries.forEach((entry, index) => {
      const node = entryList.children[index];
      const name = node && node.querySelector(".entry-name");
      if (name) name.textContent = entry.name;
    });
    entryList.querySelectorAll("button").forEach((button) => { button.disabled = spinning; });
    renderIcons();
  }

  function escapeAttribute(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
  }

  function persist() {
    try {
      Core.saveState(storage, state);
    } catch (error) {
      showToast("保存失败，请检查浏览器存储");
    }
  }

  function setInterfaceLocked(locked) {
    [manageDialog, appearanceDialog].forEach((dialog) => {
      dialog.querySelectorAll("button, input").forEach((control) => { control.disabled = locked; });
    });
    $("#manageButton").disabled = locked;
    $("#candidateButton").disabled = locked;
    $("#appearanceButton").disabled = locked;
  }

  function startSpin() {
    if (spinning || state.entries.length < 2 || !wheel) return;
    spinning = true;
    pendingWinner = Core.secureRandomIndex(state.entries.length, cryptoObject);
    spinButton.disabled = true;
    spinButton.classList.add("spinning");
    setInterfaceLocked(true);
    const revolutions = 5 + Core.secureRandomIndex(3, cryptoObject);
    wheel.spinToItem(pendingWinner, 3600, true, revolutions, 1);
  }

  function finishSpin() {
    if (!spinning || pendingWinner === null) return;
    const winner = state.entries[pendingWinner];
    spinning = false;
    pendingWinner = null;
    spinButton.classList.remove("spinning");
    setInterfaceLocked(false);
    updateWheel();
    if (!winner) return;
    $("#resultTitle").textContent = winner.name;
    if (!resultDialog.open) resultDialog.showModal();
  }

  function openManage() {
    formMessage.textContent = "";
    if (!manageDialog.open) manageDialog.showModal();
    setTimeout(() => entryInput.focus(), 80);
  }

  function addEntry(event) {
    event.preventDefault();
    const validation = Core.validateName(state.entries, entryInput.value);
    if (!validation.ok) {
      formMessage.textContent = validation.message;
      entryInput.setAttribute("aria-invalid", "true");
      return;
    }
    state.entries.push(Core.createEntry(validation.name, cryptoObject));
    persist();
    entryInput.value = "";
    entryInput.removeAttribute("aria-invalid");
    formMessage.textContent = "已添加";
    updateWheel();
    entryInput.focus();
  }

  function deleteEntry(id) {
    if (spinning) return;
    const index = state.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    deletedEntry = { entry: state.entries[index], index };
    state.entries.splice(index, 1);
    persist();
    updateWheel();
    showToast(`已删除“${deletedEntry.entry.name}”`, true);
  }

  function undoDelete() {
    if (!deletedEntry || spinning) return;
    state.entries.splice(Math.min(deletedEntry.index, state.entries.length), 0, deletedEntry.entry);
    deletedEntry = null;
    persist();
    updateWheel();
    hideToast();
  }

  function showToast(message, canUndo = false) {
    clearTimeout(toastTimer);
    toastMessage.textContent = message;
    undoButton.hidden = !canUndo;
    toast.classList.add("show");
    toastTimer = setTimeout(() => {
      deletedEntry = null;
      hideToast();
    }, canUndo ? 5000 : 2600);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.classList.remove("show");
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
  }

  $("#manageButton").addEventListener("click", openManage);
  $("#appearanceButton").addEventListener("click", openAppearance);
  $("#candidateButton").addEventListener("click", openManage);
  $("#closeManageButton").addEventListener("click", () => closeDialog(manageDialog));
  $("#closeAppearanceButton").addEventListener("click", closeAppearance);
  $("#closeResultButton").addEventListener("click", () => closeDialog(resultDialog));
  spinButton.addEventListener("click", startSpin);
  $("#spinAgainButton").addEventListener("click", () => { closeDialog(resultDialog); startSpin(); });
  addForm.addEventListener("submit", addEntry);
  undoButton.addEventListener("click", undoDelete);
  entryInput.addEventListener("input", () => { formMessage.textContent = ""; entryInput.removeAttribute("aria-invalid"); });
  $("#appearanceForm").addEventListener("submit", saveAppearance);
  $("#backgroundFile").addEventListener("change", (event) => { handleBackgroundSelection(event.target.files[0]); event.target.value = ""; });
  $("#resetNameButton").addEventListener("click", () => { $("#appearanceName").value = DEFAULT_WORKSPACE_NAME; setAppearanceMessage("已恢复默认名称，点击保存外观即可使用"); });
  $("#resetBackgroundButton").addEventListener("click", () => { appearanceDraftBackground = null; applyAppearance({ ...appearance, background: null }); $("#backgroundFileName").textContent = "使用默认背景"; setAppearanceMessage("已恢复默认背景，点击保存外观即可使用"); });
  entryList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-delete-id]");
    if (button) deleteEntry(button.dataset.deleteId);
  });

  [manageDialog, appearanceDialog, resultDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && !spinning) closeDialog(dialog);
    });
  });

  window.addEventListener("beforeinstallprompt", (event) => event.preventDefault());
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  applyAppearance();
  renderIcons();
  createWheel();
  updateWheel();
}());
