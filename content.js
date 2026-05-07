(function () {
  "use strict";

  const DEFAULT_FROM = "auto";
  const DEFAULT_TO = "zh";
  const DEFAULT_TRANSLATE_TYPE = "direct";
  const DEFAULT_DIRECT_ENGINE = "google";
  const DEFAULT_AI_PROVIDER = "nvidia";
  const DEFAULT_AI_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5";
  const AI_MODEL_OPTIONS = [
    ["nvidia/llama-3.3-nemotron-super-49b-v1.5", "轻型：NVIDIA Nemotron Super 49B"],
    ["qwen/qwen3.5-122b-a10b", "中型：Qwen 3.5 122B"],
    ["qwen/qwen3-coder-480b-a35b-instruct", "重型：Qwen3 Coder 480B（技术文档）"]
  ];
  const DEBUG_LOG = true;
  const LOG_PREFIX = "[BT-MVP]";
  const UI_IDS = {
    ball: "bt-translate-ball",
    panel: "bt-translate-panel",
    toast: "bt-translate-toast"
  };
  const LANGUAGE_OPTIONS = [
    ["auto", "自动检测"],
    ["zh", "中文"],
    ["en", "英语"],
    ["jp", "日语"],
    ["kor", "韩语"],
    ["fra", "法语"],
    ["spa", "西班牙语"],
    ["th", "泰语"],
    ["ara", "阿拉伯语"],
    ["ru", "俄语"],
    ["pt", "葡萄牙语"],
    ["de", "德语"],
    ["it", "意大利语"],
    ["vie", "越南语"]
  ];

  const state = {
    selectedText: "",
    selectedRange: null,
    selectedInput: null,
    selectedInputStart: 0,
    selectedInputEnd: 0,
    selectedInputValue: "",
    selectedInputElement: null,
    selectedEditableElement: null,
    selectedEditableRange: null,
    selectedEditableComposer: null,
    selectedMode: "none",
    selectionTimer: 0,
    toastTimer: 0,
    longPressTimer: 0,
    suppressNextClick: false,
    longPressTriggered: false,
    isTranslating: false,
    translateType: DEFAULT_TRANSLATE_TYPE,
    directEngine: DEFAULT_DIRECT_ENGINE,
    aiProvider: DEFAULT_AI_PROVIDER,
    aiModel: DEFAULT_AI_MODEL,
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    domainRoot: getRootDomain(location.hostname),
    hasLoadedDomainSettings: false,
    currentUser: null,
    authCheckPromise: null
  };

  function debugLog(step, data) {
    if (!DEBUG_LOG) {
      return;
    }
    const payload = data || {};
    window.__btTranslateDebugLogs = window.__btTranslateDebugLogs || [];
    window.__btTranslateDebugLogs.push({
      time: new Date().toISOString(),
      step: step,
      data: payload
    });
    console.log(LOG_PREFIX, step, payload);
  }

  function debugWarn(step, data) {
    if (!DEBUG_LOG) {
      return;
    }
    const payload = data || {};
    window.__btTranslateDebugLogs = window.__btTranslateDebugLogs || [];
    window.__btTranslateDebugLogs.push({
      time: new Date().toISOString(),
      level: "warn",
      step: step,
      data: payload
    });
    console.warn(LOG_PREFIX, step, payload);
  }

  function debugError(step, error, data) {
    if (!DEBUG_LOG) {
      return;
    }
    const payload = Object.assign({}, data || {}, {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : ""
    });
    window.__btTranslateDebugLogs = window.__btTranslateDebugLogs || [];
    window.__btTranslateDebugLogs.push({
      time: new Date().toISOString(),
      level: "error",
      step: step,
      data: payload
    });
    console.error(LOG_PREFIX, step, payload);
  }

  function describeElement(element) {
    if (!element) {
      return null;
    }
    return {
      tagName: element.tagName || "",
      id: element.id || "",
      className: typeof element.className === "string" ? element.className : "",
      name: element.getAttribute ? element.getAttribute("name") || "" : "",
      type: element.getAttribute ? element.getAttribute("type") || "" : "",
      valueLength: typeof element.value === "string" ? element.value.length : null,
      isConnected: !!element.isConnected,
      isContentEditable: !!element.isContentEditable,
      dataLexicalEditor: element.getAttribute ? element.getAttribute("data-lexical-editor") || "" : ""
    };
  }

  function init() {
    if (window.__baiduTranslateMvpInjected) {
      return;
    }
    window.__baiduTranslateMvpInjected = true;
    debugLog("init", { url: location.href });
    createUi();
    bindEvents();
  }

  function createUi() {
    if (document.getElementById(UI_IDS.ball)) {
      return;
    }

    const ball = document.createElement("div");
    ball.id = UI_IDS.ball;
    ball.textContent = "译";
    ball.setAttribute("role", "button");
    ball.setAttribute("aria-label", "翻译选中文字");

    const panel = document.createElement("div");
    panel.id = UI_IDS.panel;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "翻译结果");

    const toast = document.createElement("div");
    toast.id = UI_IDS.toast;

    document.documentElement.appendChild(ball);
    document.documentElement.appendChild(panel);
    document.documentElement.appendChild(toast);
  }

  function bindEvents() {
    const ball = getBall();
    const panel = getPanel();

    document.addEventListener("mouseup", scheduleSelectionCheck, true);
    document.addEventListener("touchend", scheduleSelectionCheck, true);
    document.addEventListener("selectionchange", scheduleSelectionCheck, true);
    document.addEventListener("select", scheduleSelectionCheck, true);
    document.addEventListener("input", scheduleSelectionCheck, true);
    document.addEventListener("keyup", scheduleSelectionCheck, true);

    ball.addEventListener("click", handleBallClick, true);
    ball.addEventListener("touchend", function (event) {
      event.preventDefault();
      event.stopPropagation();
      const wasLongPress = state.longPressTriggered;
      clearBallLongPress();
      if (wasLongPress || state.suppressNextClick) {
        state.suppressNextClick = false;
        window.setTimeout(function () {
          state.longPressTriggered = false;
        }, 350);
        return;
      }
      handleBallClick(event);
    }, true);
    ball.addEventListener("pointerdown", startBallLongPress, true);
    ball.addEventListener("pointerup", clearBallLongPress, true);
    ball.addEventListener("pointercancel", clearBallLongPress, true);
    ball.addEventListener("pointerleave", clearBallLongPress, true);

    panel.addEventListener("click", function (event) {
      event.stopPropagation();
    }, false);
    panel.addEventListener("touchend", function (event) {
      event.stopPropagation();
    }, false);

    document.addEventListener("mousedown", handleOutsidePointer, true);
    document.addEventListener("touchstart", handleOutsidePointer, true);
    window.addEventListener("scroll", scheduleSelectionCheck, true);
    window.addEventListener("resize", keepPanelInsideViewport, true);

    ball.addEventListener("mousedown", keepInputSelectionAlive, true);
    ball.addEventListener("touchstart", keepInputSelectionAlive, true);
  }

  function keepInputSelectionAlive(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function getBall() {
    return document.getElementById(UI_IDS.ball);
  }

  function getPanel() {
    return document.getElementById(UI_IDS.panel);
  }

  function getToast() {
    return document.getElementById(UI_IDS.toast);
  }

  function scheduleSelectionCheck() {
    window.clearTimeout(state.selectionTimer);
    state.selectionTimer = window.setTimeout(checkSelection, 120);
  }

  function checkSelection() {
    const selectionInfo = getSelectionInfo();
    if (selectionInfo.text.length > 0) {
      saveSelectionInfo(selectionInfo);
      debugLog("selection.detected", {
        mode: selectionInfo.mode,
        textLength: selectionInfo.text.length,
        textPreview: selectionInfo.text.slice(0, 80),
        input: describeElement(selectionInfo.input),
        inputStart: selectionInfo.inputStart,
        inputEnd: selectionInfo.inputEnd
      });
      showBall();
      return;
    }

    if (!getPanel().classList.contains("bt-visible")) {
      hideBall();
    }
  }

  function getSelectionInfo() {
    const inputSelection = getInputSelectionInfo();
    if (inputSelection.text) {
      return inputSelection;
    }

    const editableSelection = getContentEditableSelectionInfo();
    if (editableSelection.text) {
      return editableSelection;
    }

    if (state.selectedMode === "input" && state.selectedText && isTextInputElement(state.selectedInput)) {
      return {
        text: state.selectedText,
        range: null,
        input: state.selectedInput,
        inputStart: state.selectedInputStart,
        inputEnd: state.selectedInputEnd,
        inputValue: state.selectedInputValue,
        mode: "input"
      };
    }

    const selection = window.getSelection ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0) {
      return { text: "", range: null, input: null, inputStart: 0, inputEnd: 0, inputValue: "", mode: "none" };
    }

    const text = selection.toString().trim();
    if (!text) {
      return { text: "", range: null, input: null, inputStart: 0, inputEnd: 0, inputValue: "", mode: "none" };
    }

    return {
      text: text,
      range: selection.getRangeAt(0).cloneRange(),
      input: null,
      inputStart: 0,
      inputEnd: 0,
      inputValue: "",
      mode: "dom"
    };
  }

  function saveSelectionInfo(selectionInfo) {
    state.selectedText = selectionInfo.text;
    state.selectedRange = selectionInfo.range;
    state.selectedInput = selectionInfo.input || null;
    state.selectedInputElement = selectionInfo.input || null;
    state.selectedEditableElement = selectionInfo.editable || null;
    state.selectedEditableRange = selectionInfo.editableRange || null;
    state.selectedEditableComposer = selectionInfo.composer || null;
    state.selectedInputStart = selectionInfo.inputStart || 0;
    state.selectedInputEnd = selectionInfo.inputEnd || 0;
    state.selectedInputValue = selectionInfo.inputValue || "";
    state.selectedMode = selectionInfo.mode || "dom";
  }

  function captureSelectionContextBeforeTranslate() {
    const selectionInfo = getSelectionInfo();
    if (selectionInfo.text) {
      saveSelectionInfo(selectionInfo);
      return selectionInfo;
    }

    if (state.selectedMode === "input" && isTextInputElement(state.selectedInputElement)) {
      return {
        text: state.selectedText,
        range: null,
        input: state.selectedInputElement,
        inputStart: state.selectedInputStart,
        inputEnd: state.selectedInputEnd,
        inputValue: state.selectedInputValue,
        mode: "input"
      };
    }

    if (state.selectedMode === "contenteditable" && isContentEditableEditor(state.selectedEditableElement)) {
      return {
        text: state.selectedText,
        range: state.selectedEditableRange || state.selectedRange,
        input: null,
        inputStart: 0,
        inputEnd: 0,
        inputValue: "",
        editable: state.selectedEditableElement,
        editableRange: state.selectedEditableRange || state.selectedRange,
        composer: state.selectedEditableComposer,
        mode: "contenteditable"
      };
    }

    return {
      text: state.selectedText,
      range: state.selectedRange,
      input: null,
      inputStart: 0,
      inputEnd: 0,
      inputValue: "",
      mode: state.selectedMode || "dom"
    };
  }

  function getInputSelectionInfo() {
    const element = document.activeElement;
    if (!isTextInputElement(element)) {
      return { text: "", range: null, input: null, inputStart: 0, inputEnd: 0, inputValue: "", mode: "none" };
    }

    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number" || end <= start) {
      debugLog("input.selection.empty", {
        activeElement: describeElement(element),
        start: start,
        end: end
      });
      return { text: "", range: null, input: null, inputStart: 0, inputEnd: 0, inputValue: "", mode: "none" };
    }

    return {
      text: element.value.slice(start, end).trim(),
      range: null,
      input: element,
      inputStart: start,
      inputEnd: end,
      inputValue: element.value,
      mode: "input"
    };
  }

  function getContentEditableSelectionInfo() {
    const selection = window.getSelection ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0) {
      return createEmptySelectionInfo();
    }

    const text = selection.toString().trim();
    if (!text) {
      return createEmptySelectionInfo();
    }

    const range = selection.getRangeAt(0).cloneRange();
    const editable = getEditableElementFromRange(range);
    if (!isContentEditableEditor(editable)) {
      return createEmptySelectionInfo();
    }

    return {
      text: text,
      range: range,
      input: null,
      inputStart: 0,
      inputEnd: 0,
      inputValue: "",
      editable: editable,
      editableRange: range,
      composer: findEditableComposer(editable),
      mode: "contenteditable"
    };
  }

  function createEmptySelectionInfo() {
    return { text: "", range: null, input: null, inputStart: 0, inputEnd: 0, inputValue: "", mode: "none" };
  }

  function getEditableElementFromRange(range) {
    const node = range.commonAncestorContainer;
    const element = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    return element ? element.closest("[contenteditable='true'],[contenteditable='plaintext-only'],[role='textbox'][data-lexical-editor='true']") : null;
  }

  function isContentEditableEditor(element) {
    return !!element && element.nodeType === Node.ELEMENT_NODE && (element.isContentEditable || element.getAttribute("contenteditable") === "true" || element.getAttribute("contenteditable") === "plaintext-only");
  }

  function findEditableComposer(editable) {
    if (!editable || !editable.closest) {
      return null;
    }
    return editable.closest("shreddit-composer,[data-lexical-editor-root],form,[role='dialog']");
  }

  function isTextInputElement(element) {
    if (!element) {
      return false;
    }

    const tagName = element.tagName ? element.tagName.toLowerCase() : "";
    if (tagName === "textarea") {
      return true;
    }

    if (tagName !== "input") {
      return false;
    }

    const type = (element.getAttribute("type") || "text").toLowerCase();
    return ["text", "search", "url", "email", "tel", "password"].indexOf(type) !== -1;
  }

  function showBall() {
    getBall().classList.add("bt-visible");
  }

  function hideBall() {
    getBall().classList.remove("bt-visible", "bt-loading");
  }

  function showPanel() {
    getPanel().classList.add("bt-visible");
    keepPanelInsideViewport();
  }

  function hidePanel() {
    getPanel().classList.remove("bt-visible");
  }

  function handleOutsidePointer(event) {
    const ball = getBall();
    const panel = getPanel();
    const target = event.target;

    if (ball.contains(target) || panel.contains(target)) {
      return;
    }

    window.setTimeout(function () {
      const latestSelection = getSelectionInfo();
      if (latestSelection.text.length > 0) {
        saveSelectionInfo(latestSelection);
        showBall();
        return;
      }
      hideBall();
      hidePanel();
    }, 80);
  }

  async function handleBallClick(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (state.longPressTriggered || state.suppressNextClick) {
      state.suppressNextClick = false;
      window.setTimeout(function () {
        state.longPressTriggered = false;
      }, 350);
      return;
    }

    if (state.isTranslating) {
      debugWarn("ball.click.ignoredTranslating");
      return;
    }

    const selectionInfo = captureSelectionContextBeforeTranslate();
    const text = selectionInfo.text || state.selectedText;
    debugLog("ball.click.selectionSnapshot", {
      mode: selectionInfo.mode,
      textLength: text ? text.length : 0,
      textPreview: text ? text.slice(0, 80) : "",
      input: describeElement(selectionInfo.input || state.selectedInputElement || state.selectedInput),
      inputStart: selectionInfo.inputStart,
      inputEnd: selectionInfo.inputEnd,
      stateMode: state.selectedMode,
      stateInput: describeElement(state.selectedInputElement || state.selectedInput)
    });

    if (!text) {
      debugWarn("ball.click.noText");
      showToast("请先选择需要翻译的文字");
      hideBall();
      return;
    }

    state.selectedText = text;
    setLoading(true);
    showToast("翻译中...");

    try {
      await ensureReadyForTranslate(state.translateType);
      debugLog("translate.start", { translateType: state.translateType, directEngine: state.directEngine, aiProvider: state.aiProvider, aiModel: state.aiModel, from: state.from, to: state.to, textLength: text.length });
      const translatedText = await translateSelected(text, state.from, state.to);
      debugLog("translate.success", {
        translatedLength: translatedText ? translatedText.length : 0,
        translatedPreview: translatedText ? translatedText.slice(0, 80) : ""
      });
      replaceSelectedText(translatedText);
      hidePanel();
      hideBall();
      showToast("已翻译并替换原文");
    } catch (error) {
      debugError("translate.orReplace.error", error);
      handleTranslateError(error);
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    state.isTranslating = isLoading;
    getBall().classList.toggle("bt-loading", isLoading);
  }

  function renderPanel(originalText, translatedText, isError) {
    const panel = getPanel();
    panel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "bt-panel-header";

    const title = document.createElement("h2");
    title.className = "bt-panel-title";
    title.textContent = "百度翻译";

    const closeButton = document.createElement("button");
    closeButton.className = "bt-panel-close";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "关闭翻译结果");
    closeButton.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      hidePanel();
      hideBall();
    });

    header.appendChild(title);
    header.appendChild(closeButton);
    panel.appendChild(header);
    panel.appendChild(createSection("原文", originalText, ""));
    panel.appendChild(createSection("译文", translatedText, isError ? "bt-error" : "bt-result"));
    keepPanelInsideViewport();
  }

  function createEngineField() {
    const field = document.createElement("div");
    field.className = "bt-language-field bt-engine-field";

    const label = document.createElement("label");
    label.textContent = "直译引擎";

    const select = document.createElement("select");
    [
      ["google", "Google 非官方免费接口（默认）"],
      ["baidu", "百度翻译（已配置）"]
    ].forEach(function (item) {
      const option = document.createElement("option");
      option.value = item[0];
      option.textContent = item[1];
      option.selected = item[0] === state.directEngine;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      state.directEngine = select.value;
    });

    field.appendChild(label);
    field.appendChild(select);
    return field;
  }

  function createTranslateTypeField() {
    const field = document.createElement("div");
    field.className = "bt-language-field bt-engine-field";
    const label = document.createElement("label");
    label.textContent = "翻译类型";
    const select = document.createElement("select");
    [["direct", "直译：百度 / Google"], ["ai", "AI：NVIDIA 云模型"]].forEach(function (item) {
      const option = document.createElement("option");
      option.value = item[0];
      option.textContent = item[1];
      option.selected = item[0] === state.translateType;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      state.translateType = select.value;
      renderLanguageSettingsPanel();
    });
    field.appendChild(label);
    field.appendChild(select);
    return field;
  }

  function createAiModelField() {
    const field = document.createElement("div");
    field.className = "bt-language-field bt-engine-field";
    const label = document.createElement("label");
    label.textContent = "NVIDIA 模型";
    const select = document.createElement("select");
    AI_MODEL_OPTIONS.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item[0];
      option.textContent = item[1];
      option.selected = item[0] === state.aiModel;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      state.aiModel = select.value;
    });
    field.appendChild(label);
    field.appendChild(select);
    return field;
  }

  function createNvidiaKeyButton() {
    return createActionButton("保存 / 更新 NVIDIA API Key", async function () {
      showNvidiaKeyPanel();
    });
  }

  function createLanguageControls() {
    const wrapper = document.createElement("div");
    wrapper.className = "bt-language-settings";
    const row = document.createElement("div");
    row.className = "bt-language-row";
    wrapper.appendChild(createTranslateTypeField());
    if (state.translateType === "ai") {
      wrapper.appendChild(createAiModelField());
      wrapper.appendChild(createNvidiaKeyButton());
    } else {
      wrapper.appendChild(createEngineField());
    }
    row.appendChild(createLanguageField("原始语言", "from", state.from, true));
    const swap = document.createElement("button");
    swap.type = "button";
    swap.className = "bt-swap-button";
    swap.textContent = "⇄";
    swap.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (state.from === "auto") {
        showToast("自动检测不能作为目标语言，请先选择具体原始语言");
        return;
      }
      const nextFrom = state.to;
      state.to = state.from;
      state.from = nextFrom;
      renderLanguageSettingsPanel();
    });
    row.appendChild(swap);
    row.appendChild(createLanguageField("目标语言", "to", state.to, false));
    const save = document.createElement("button");
    save.type = "button";
    save.className = "bt-primary-button";
    save.textContent = "保存为当前域名默认设置";
    save.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopPropagation();
      try {
        await saveCurrentDomainSettings();
      } catch (error) {
        handleExtensionContextError(error);
      }
    });
    const hint = document.createElement("p");
    hint.className = "bt-settings-hint";
    hint.textContent = "当前域名：" + state.domainRoot + "。设置会保存到本地；登录后同步到云端，其它设备会自动导入。直译默认 Google，可安装即用；AI 翻译需先保存 NVIDIA Key。";
    wrapper.appendChild(row);
    wrapper.appendChild(save);
    wrapper.appendChild(hint);
    return wrapper;
  }

  function createLanguageField(labelText, key, currentValue, includeAuto) {
    const field = document.createElement("div");
    field.className = "bt-language-field";

    const label = document.createElement("label");
    label.textContent = labelText;

    const select = document.createElement("select");
    LANGUAGE_OPTIONS.forEach(function (item) {
      if (!includeAuto && item[0] === "auto") {
        return;
      }
      const option = document.createElement("option");
      option.value = item[0];
      option.textContent = item[1];
      option.selected = item[0] === currentValue;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      state[key] = select.value;
    });

    field.appendChild(label);
    field.appendChild(select);
    return field;
  }

  function createSection(label, content, extraClassName) {
    const section = document.createElement("section");
    section.className = "bt-section";

    const sectionLabel = document.createElement("p");
    sectionLabel.className = "bt-section-label";
    sectionLabel.textContent = label;

    const sectionContent = document.createElement("p");
    sectionContent.className = "bt-section-content" + (extraClassName ? " " + extraClassName : "");
    sectionContent.textContent = content;

    section.appendChild(sectionLabel);
    section.appendChild(sectionContent);
    return section;
  }

  function replaceSelectedText(translatedText) {
    debugLog("replace.start", {
      mode: state.selectedMode,
      translatedLength: translatedText ? translatedText.length : 0,
      input: describeElement(state.selectedInputElement || state.selectedInput),
      editable: describeElement(state.selectedEditableElement),
      hasRange: !!state.selectedRange
    });
    if (state.selectedMode === "input") {
      if (!replaceInputSelectedText(translatedText)) {
        debugWarn("replace.input.failed");
        showToast("输入框替换失败：选区已丢失，请重新选中文字后再点悬浮球");
      }
      return;
    }

    if (state.selectedMode === "contenteditable") {
      if (!replaceContentEditableSelectedText(translatedText)) {
        debugWarn("replace.contenteditable.failed");
        showToast("富文本编辑器替换失败，已在弹窗显示译文");
      }
      return;
    }

    const range = state.selectedRange;
    if (!range || !translatedText) {
      return;
    }

    try {
      debugLog("replace.dom.before", { textPreview: translatedText.slice(0, 80) });
      const mark = document.createElement("span");
      mark.className = "bt-replaced-mark";
      mark.textContent = translatedText;
      range.deleteContents();
      range.insertNode(mark);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      state.selectedRange = null;
      state.selectedInput = null;
      state.selectedInputElement = null;
      state.selectedEditableElement = null;
      state.selectedEditableRange = null;
      state.selectedEditableComposer = null;
      state.selectedInputValue = "";
      state.selectedMode = "none";
      state.selectedText = translatedText;
      debugLog("replace.dom.success");
    } catch (error) {
      debugError("replace.dom.error", error);
      showToast("当前网页不允许直接替换选中文字，已在弹窗显示译文");
    }
  }

  function replaceInputSelectedText(translatedText) {
    const input = state.selectedInputElement || state.selectedInput;
    if (!isTextInputElement(input) || !translatedText) {
      debugWarn("replace.input.invalidTarget", {
        input: describeElement(input),
        hasTranslatedText: !!translatedText
      });
      return false;
    }

    const valueLength = input.value.length;
    const start = Math.min(Math.max(0, state.selectedInputStart), valueLength);
    const end = Math.min(Math.max(start, state.selectedInputEnd), valueLength);
    debugLog("replace.input.snapshot", {
      input: describeElement(input),
      valueLength: valueLength,
      start: start,
      end: end,
      selectedInputValueLength: state.selectedInputValue ? state.selectedInputValue.length : 0,
      currentSelectedText: input.value.slice(start, end),
      translatedPreview: translatedText.slice(0, 80)
    });
    if (end <= start) {
      debugWarn("replace.input.invalidRange", { start: start, end: end, valueLength: valueLength });
      return false;
    }

    focusInputAndRestoreSelection(input, start, end);

    if (!simulateKeyboardTextInput(input, translatedText, start, end)) {
      return false;
    }

    input.dispatchEvent(new Event("change", { bubbles: true }));
    debugLog("replace.input.success", {
      finalValueLength: input.value.length,
      finalSelectionStart: input.selectionStart,
      finalSelectionEnd: input.selectionEnd,
      finalValuePreview: input.value.slice(Math.max(0, start - 20), Math.min(input.value.length, start + translatedText.length + 20))
    });

    state.selectedText = translatedText;
    state.selectedInput = null;
    state.selectedInputElement = null;
    state.selectedInputValue = "";
    state.selectedRange = null;
    state.selectedMode = "none";
    return true;
  }

  function replaceContentEditableSelectedText(translatedText) {
    const editable = state.selectedEditableElement;
    const range = state.selectedEditableRange || state.selectedRange;
    if (!isContentEditableEditor(editable) || !range || !translatedText) {
      debugWarn("replace.contenteditable.invalidTarget", {
        editable: describeElement(editable),
        hasRange: !!range,
        hasTranslatedText: !!translatedText
      });
      return false;
    }

    debugLog("replace.contenteditable.snapshot", {
      editable: describeElement(editable),
      composer: describeElement(state.selectedEditableComposer),
      textBefore: editable.textContent,
      htmlBefore: editable.innerHTML.slice(0, 500),
      translatedPreview: translatedText.slice(0, 80),
      hasLexical: !!editable.__lexicalEditor
    });

    focusEditableAndRestoreRange(editable, range);

    if (!simulateEditableTextInput(editable, translatedText)) {
      return false;
    }

    syncKnownComposerValue(editable, translatedText);
    debugLog("replace.contenteditable.success", {
      textAfter: editable.textContent,
      htmlAfter: editable.innerHTML.slice(0, 500),
      composerValue: state.selectedEditableComposer && typeof state.selectedEditableComposer.value === "string" ? state.selectedEditableComposer.value.slice(0, 300) : ""
    });

    state.selectedText = translatedText;
    state.selectedRange = null;
    state.selectedInput = null;
    state.selectedInputElement = null;
    state.selectedEditableElement = null;
    state.selectedEditableRange = null;
    state.selectedEditableComposer = null;
    state.selectedInputValue = "";
    state.selectedMode = "none";
    return true;
  }

  function focusEditableAndRestoreRange(editable, range) {
    try {
      editable.focus({ preventScroll: true });
    } catch (error) {
      debugError("replace.contenteditable.focus.error", error);
      editable.focus();
    }

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    debugLog("replace.contenteditable.rangeRestored", {
      activeElement: describeElement(document.activeElement),
      selectedText: selection ? selection.toString() : ""
    });
  }

  function simulateEditableTextInput(editable, text) {
    debugLog("simulateEditable.start", { textLength: text.length });
    dispatchKeyboardEvent(editable, "keydown", text);

    let beforeInputAllowed = true;
    try {
      beforeInputAllowed = editable.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text
      }));
      debugLog("simulateEditable.beforeinput", { allowed: beforeInputAllowed });
    } catch (error) {
      debugError("simulateEditable.beforeinput.error", error);
    }

    if (!beforeInputAllowed) {
      dispatchKeyboardEvent(editable, "keyup", text);
      return false;
    }

    let inserted = false;
    if (typeof document.execCommand === "function") {
      try {
        inserted = document.execCommand("insertText", false, text);
        debugLog("simulateEditable.execCommand", { inserted: inserted, textAfter: editable.textContent });
      } catch (error) {
        debugError("simulateEditable.execCommand.error", error);
      }
    }

    if (!inserted) {
      inserted = replaceCurrentRangeWithTextNode(text);
      debugLog("simulateEditable.rangeFallback", { inserted: inserted, textAfter: editable.textContent });
    }

    dispatchInputEvent(editable, text);
    editable.dispatchEvent(new Event("change", { bubbles: true }));
    dispatchKeyboardEvent(editable, "keyup", text);
    debugLog("simulateEditable.end", { inserted: inserted, textAfter: editable.textContent });
    return inserted;
  }

  function replaceCurrentRangeWithTextNode(text) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function syncKnownComposerValue(editable, text) {
    const composer = state.selectedEditableComposer;
    if (!composer || composer.tagName !== "SHREDDIT-COMPOSER") {
      return;
    }

    try {
      const nextValue = JSON.stringify({ document: [{ e: "par", c: [{ e: "text", t: editable.textContent || text }] }] });
      composer.value = nextValue;
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
      debugLog("replace.contenteditable.syncShredditComposer", { value: nextValue });
    } catch (error) {
      debugError("replace.contenteditable.syncShredditComposer.error", error);
    }
  }

  function focusInputAndRestoreSelection(input, start, end) {
    try {
      input.focus({ preventScroll: true });
      debugLog("replace.input.focusPreventScroll", { activeElement: describeElement(document.activeElement) });
    } catch (error) {
      debugError("replace.input.focusPreventScroll.error", error);
      input.focus();
      debugLog("replace.input.focusFallback", { activeElement: describeElement(document.activeElement) });
    }
    input.setSelectionRange(start, end);
    debugLog("replace.input.selectionRestored", {
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      activeElement: describeElement(document.activeElement)
    });
  }

  function simulateKeyboardTextInput(input, text, start, end) {
    debugLog("simulateInput.start", { start: start, end: end, textLength: text.length });
    dispatchKeyboardEvent(input, "keydown", text);

    let beforeInputAllowed = true;
    try {
      beforeInputAllowed = input.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertReplacementText",
        data: text
      }));
      debugLog("simulateInput.beforeinput", { allowed: beforeInputAllowed });
    } catch (error) {
      debugError("simulateInput.beforeinput.error", error);
      beforeInputAllowed = true;
    }

    if (!beforeInputAllowed) {
      debugWarn("simulateInput.beforeinput.cancelled");
      dispatchKeyboardEvent(input, "keyup", text);
      return false;
    }

    let inserted = false;
    if (typeof document.execCommand === "function") {
      try {
        inserted = document.execCommand("insertText", false, text);
        debugLog("simulateInput.execCommand", { inserted: inserted, valueLength: input.value.length });
      } catch (error) {
        debugError("simulateInput.execCommand.error", error);
        inserted = false;
      }
    }

    if (!inserted && typeof input.setRangeText === "function") {
      input.setRangeText(text, start, end, "end");
      inserted = true;
      debugLog("simulateInput.setRangeText", { valueLength: input.value.length });
    }

    if (!inserted) {
      const baseValue = state.selectedInputValue || input.value;
      const safeStart = Math.min(start, baseValue.length);
      const safeEnd = Math.min(Math.max(safeStart, end), baseValue.length);
      const nextValue = baseValue.slice(0, safeStart) + text + baseValue.slice(safeEnd);
      setNativeInputValue(input, nextValue);
      input.setSelectionRange(safeStart + text.length, safeStart + text.length);
      inserted = true;
      debugLog("simulateInput.nativeValueFallback", {
        baseValueLength: baseValue.length,
        nextValueLength: nextValue.length,
        safeStart: safeStart,
        safeEnd: safeEnd
      });
    }

    dispatchInputEvent(input, text);
    dispatchKeyboardEvent(input, "keyup", text);
    debugLog("simulateInput.end", { inserted: inserted, valueLength: input.value.length });
    return inserted;
  }

  function dispatchInputEvent(input, text) {
    try {
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: text
      }));
    } catch (error) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function dispatchKeyboardEvent(input, type, text) {
    try {
      input.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: text.length === 1 ? text : "Process",
        code: "Unidentified"
      }));
    } catch (error) {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    }
  }

  function setNativeInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(input, value);
      return;
    }
    input.value = value;
  }

  function keepPanelInsideViewport() {
    const panel = getPanel();
    if (!panel || !panel.classList.contains("bt-visible")) {
      return;
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    if (viewportWidth <= 520) {
      panel.style.maxHeight = Math.max(180, viewportHeight - 120) + "px";
      return;
    }

    panel.style.maxHeight = Math.max(220, Math.min(500, viewportHeight - 40)) + "px";
  }

  function showToast(message) {
    const toast = getToast();
    toast.textContent = message;
    toast.classList.add("bt-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      toast.classList.remove("bt-visible");
    }, 3000);
  }

  function getRootDomain(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    if (parts.length <= 2 || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return host || "local";
    }
    const twoPartSuffixes = ["com.cn", "net.cn", "org.cn", "gov.cn", "co.uk", "com.au", "co.jp"];
    const suffix = parts.slice(-2).join(".");
    if (twoPartSuffixes.indexOf(suffix) !== -1 && parts.length >= 3) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  }

  function getDomainStorageKey() {
    return "fanyiDomainSettings:" + state.domainRoot;
  }

  function sendRuntimeMessage(message) {
    return new Promise(function (resolve, reject) {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error("EXTENSION_CONTEXT_INVALIDATED"));
        return;
      }
      try {
        chrome.runtime.sendMessage(message, function (response) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error((response && response.error) || "请求失败"));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    }).catch(function (error) {
      if (isExtensionContextInvalidated(error)) {
        throw new Error("EXTENSION_CONTEXT_INVALIDATED");
      }
      throw error;
    });
  }

  function isExtensionContextInvalidated(error) {
    const message = error && error.message ? error.message : String(error || "");
    return message.indexOf("Extension context invalidated") !== -1 || message === "EXTENSION_CONTEXT_INVALIDATED";
  }

  function handleExtensionContextError(error) {
    if (isExtensionContextInvalidated(error)) {
      showToast("扩展已刷新，请刷新当前网页后再使用");
      hideBall();
      return true;
    }
    showToast(error && error.message ? error.message : "操作失败，请稍后重试");
    return false;
  }

  function storageGet(keys) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise(function (resolve) {
        chrome.storage.local.get(keys, function (items) {
          resolve(items || {});
        });
      });
    }
    return sendRuntimeMessage({ type: "FANYI_STORAGE_GET", keys: keys }).then(function (response) {
      return response.items || {};
    });
  }

  function storageSet(items) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise(function (resolve) {
        chrome.storage.local.set(items, resolve);
      });
    }
    return sendRuntimeMessage({ type: "FANYI_STORAGE_SET", items: items });
  }

  function buildSettingsPayload() {
    return {
      translateType: state.translateType,
      directEngine: state.directEngine,
      aiProvider: state.aiProvider,
      aiModel: state.aiModel,
      from: state.from,
      to: state.to
    };
  }

  async function ensureReadyForTranslate(translateType) {
    if ((translateType || state.translateType) === "direct" && state.directEngine === "google") {
      return;
    }

    const me = await sendRuntimeMessage({ type: "FANYI_ME" }).catch(function (error) {
      if (error.message === "NEED_LOGIN" || error.message.indexOf("登录") !== -1) {
        showAccountPanel("请先登录账号。Google 直译可免登录使用；百度和 AI 翻译需要云端保存 Key。");
        throw new Error("请先登录翻译插件账户");
      }
      throw error;
    });

    if ((translateType || state.translateType) === "ai") {
      if (!me.has_nvidia_credentials) {
        showNvidiaKeyPanel("请先注册 NVIDIA 云模型账号并填写 API Key。保存后才能使用 AI 翻译。");
        throw new Error("请先设置 NVIDIA API Key");
      }
      return;
    }

    if (state.directEngine === "baidu" && !me.has_baidu_credentials) {
      showCredentialPanel("当前账号没有百度 APP ID 和 Key，请设置后同步到官网。");
      throw new Error("请先设置百度 APP ID 和 Key");
    }
  }

  function loadDomainSettingsFromServer() {
    sendRuntimeMessage({ type: "FANYI_GET_DOMAIN_SETTINGS", domain: state.domainRoot }).then(function (response) {
      if (response.has_settings) {
        applyRemoteDomainSettings(response);
      }
      state.hasLoadedDomainSettings = true;
    }).catch(function () {
      state.hasLoadedDomainSettings = true;
    });
  }

  function applyRemoteDomainSettings(response) {
    state.translateType = response.translate_type || response.translateType || DEFAULT_TRANSLATE_TYPE;
    state.directEngine = response.direct_engine || response.engine || DEFAULT_DIRECT_ENGINE;
    state.aiProvider = response.ai_provider || DEFAULT_AI_PROVIDER;
    state.aiModel = response.ai_model || DEFAULT_AI_MODEL;
    state.from = response.from || DEFAULT_FROM;
    state.to = response.to || DEFAULT_TO;
    const data = {};
    data[getDomainStorageKey()] = buildSettingsPayload();
    storageSet(data);
  }

  async function loadDomainSettingsFromServerNow() {
    const response = await sendRuntimeMessage({ type: "FANYI_GET_DOMAIN_SETTINGS", domain: state.domainRoot });
    if (response.has_settings) {
      applyRemoteDomainSettings(response);
    }
    state.hasLoadedDomainSettings = true;
    return response;
  }

  async function getCurrentUser() {
    if (state.currentUser) {
      return state.currentUser;
    }
    if (state.authCheckPromise) {
      return state.authCheckPromise;
    }
    state.authCheckPromise = sendRuntimeMessage({ type: "FANYI_ME" }).then(function (me) {
      state.currentUser = me;
      return me;
    }).finally(function () {
      state.authCheckPromise = null;
    });
    return state.authCheckPromise;
  }

  async function importCredentialsIfLoggedIn() {
    try {
      const response = await sendRuntimeMessage({ type: "FANYI_IMPORT_CREDENTIALS" });
      debugLog("credentials.imported", response);
      return response;
    } catch (error) {
      debugWarn("credentials.import.skipped", { message: error.message });
      return null;
    }
  }

  async function saveCurrentDomainSettings() {
    const data = {};
    data[getDomainStorageKey()] = buildSettingsPayload();
    await storageSet(data);
    try {
      await sendRuntimeMessage(Object.assign({ type: "FANYI_SAVE_DOMAIN_SETTINGS", domain: state.domainRoot }, buildSettingsPayload()));
      showToast("已保存 " + state.domainRoot + " 的云端翻译设置");
    } catch (error) {
      if (error.message === "NEED_LOGIN" || error.message.indexOf("登录") !== -1) {
        showToast("已本地保存；登录后可同步到云端");
      } else {
        throw error;
      }
    }
    hidePanel();
  }

  function startBallLongPress(event) {
    keepInputSelectionAlive(event);
    window.clearTimeout(state.longPressTimer);
    state.longPressTriggered = false;
    state.suppressNextClick = false;
    state.longPressTimer = window.setTimeout(function () {
      state.longPressTriggered = true;
      state.suppressNextClick = true;
      openPanelByAuthState();
    }, 650);
  }

  async function openPanelByAuthState() {
    try {
      showToast("正在检查登录状态...");
      await getCurrentUser();
      await importCredentialsIfLoggedIn();
      await loadDomainSettingsFromServerNow().catch(function () {
        return null;
      });
      renderLanguageSettingsPanel();
      showPanel();
    } catch (error) {
      state.currentUser = null;
      showAccountPanel("请先登录或注册账号。登录成功后会自动读取官网已保存的翻译设置；已登录用户长按悬浮球才进入设置界面。");
    }
  }

  function clearBallLongPress() {
    window.clearTimeout(state.longPressTimer);
  }

  function renderLanguageSettingsPanel() {
    const panel = getPanel();
    panel.innerHTML = "";
    panel.appendChild(createSimpleHeader("当前域名翻译设置"));
    panel.appendChild(createLanguageControls());
    keepPanelInsideViewport();
  }

  function showAccountPanel(message) {
    const panel = getPanel();
    panel.innerHTML = "";
    panel.appendChild(createSimpleHeader("登录翻译账号"));
    const tip = document.createElement("p");
    tip.className = "bt-section-content";
    tip.textContent = message || "请先登录账号";
    const email = createTextInput("email", "E-mail");
    const password = createTextInput("password", "密码", "password");
    const row = document.createElement("div");
    row.className = "bt-action-row";
    row.appendChild(createActionButton("登录", async function () { await authFromPanel("FANYI_LOGIN", email.value, password.value); }));
    row.appendChild(createActionButton("注册", async function () { await authFromPanel("FANYI_REGISTER", email.value, password.value); }));
    panel.appendChild(tip);
    panel.appendChild(email);
    panel.appendChild(password);
    panel.appendChild(row);
    showPanel();
  }

  async function authFromPanel(type, email, password) {
    try {
      await sendRuntimeMessage({ type: type, email: email, password: password });
      showToast("登录成功，正在读取官网配置");
      const me = await sendRuntimeMessage({ type: "FANYI_ME" });
      state.currentUser = me;
      const imported = await importCredentialsIfLoggedIn();
      const settings = await loadDomainSettingsFromServerNow().catch(function () {
        return null;
      });
      hidePanel();
      if (settings && settings.has_settings) {
        showToast("已登录，并已自动导入当前网站的云端设置");
      } else if (imported && (imported.has_baidu_credentials || imported.has_nvidia_credentials)) {
        showToast("已登录，并已自动导入网站端保存的百度 / NVIDIA Key");
      } else {
        showToast(me.has_baidu_credentials || me.has_nvidia_credentials ? "已登录，并已读取官网账号配置" : "登录成功；Google 直译可直接使用");
      }
    } catch (error) {
      showToast(error.message);
    }
  }

  function showCredentialPanel(message) {
    const panel = getPanel();
    panel.innerHTML = "";
    panel.appendChild(createSimpleHeader("设置百度翻译 API"));
    const tip = document.createElement("p");
    tip.className = "bt-section-content";
    tip.textContent = message || "请填写百度 APP ID 和 Key，会同步保存到官网账号。";
    const appId = createTextInput("appId", "百度 APP ID");
    const secretKey = createTextInput("secretKey", "百度 Key");
    panel.appendChild(tip);
    panel.appendChild(appId);
    panel.appendChild(secretKey);
    panel.appendChild(createActionButton("保存并同步到官网", async function () {
      try {
        await sendRuntimeMessage({ type: "FANYI_SAVE_CREDENTIALS", appId: appId.value, secretKey: secretKey.value });
        hidePanel();
        showToast("百度配置已同步保存，请再次点击悬浮球翻译");
      } catch (error) {
        showToast(error.message);
      }
    }));
    showPanel();
  }

  function showNvidiaKeyPanel(message) {
    const panel = getPanel();
    panel.innerHTML = "";
    panel.appendChild(createSimpleHeader("设置 NVIDIA 云模型 API"));
    const tip = document.createElement("p");
    tip.className = "bt-section-content";
    tip.textContent = message || "请先注册 NVIDIA 云模型账号并填写 API Key。Key 会加密保存到官网账号名下，用于所有设备同步使用。";
    const apiKey = createTextInput("nvidiaApiKey", "NVIDIA API Key", "password");
    panel.appendChild(tip);
    panel.appendChild(apiKey);
    panel.appendChild(createActionButton("保存并同步 NVIDIA Key", async function () {
      try {
        await sendRuntimeMessage({ type: "FANYI_SAVE_NVIDIA_CREDENTIALS", apiKey: apiKey.value });
        hidePanel();
        showToast("NVIDIA Key 已加密保存到云端");
      } catch (error) {
        if (error.message === "NEED_LOGIN" || error.message.indexOf("登录") !== -1) {
          showAccountPanel("请先登录账号，再保存 NVIDIA API Key。");
          return;
        }
        showToast(error.message);
      }
    }));
    showPanel();
  }

  function createSimpleHeader(titleText) {
    const header = document.createElement("div");
    header.className = "bt-panel-header";
    const title = document.createElement("h2");
    title.className = "bt-panel-title";
    title.textContent = titleText;
    const closeButton = document.createElement("button");
    closeButton.className = "bt-panel-close";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.addEventListener("click", function () { hidePanel(); });
    header.appendChild(title);
    header.appendChild(closeButton);
    return header;
  }

  function createTextInput(name, placeholder, type) {
    const input = document.createElement("input");
    input.className = "bt-panel-input";
    input.name = name;
    input.type = type || "text";
    input.placeholder = placeholder;
    return input;
  }

  function createActionButton(text, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bt-primary-button";
    button.textContent = text;
    let isRunning = false;
    async function run(event) {
      event.preventDefault();
      event.stopPropagation();
      if (isRunning) {
        return;
      }
      isRunning = true;
      button.disabled = true;
      const oldText = button.textContent;
      button.textContent = "处理中...";
      try {
        await handler();
      } finally {
        isRunning = false;
        button.disabled = false;
        button.textContent = oldText;
      }
    }
    button.addEventListener("click", run);
    button.addEventListener("touchend", run, { passive: false });
    return button;
  }

  function handleTranslateError(error) {
    const message = error && error.message ? error.message : "翻译失败，请稍后重试";
    if (message === "NEED_LOGIN" || message.indexOf("登录") !== -1) {
      showAccountPanel("请先登录账号，然后自动读取官网已保存的百度配置。");
      return;
    }
    if (message.indexOf("APP ID") !== -1 || message.indexOf("Key") !== -1 || message.indexOf("百度翻译配置") !== -1) {
      if (message.indexOf("NVIDIA") !== -1) {
        showNvidiaKeyPanel("请先注册 NVIDIA 云模型账号并填写 API Key。");
      } else {
        showCredentialPanel("当前账号没有百度 APP ID 和 Key，请设置后同步到官网。");
      }
      return;
    }
    showToast(message);
  }

  function loadLanguageSettings() {
    const key = getDomainStorageKey();
    storageGet([key, "fanyiTranslateType", "baiduTranslateEngine", "fanyiDirectEngine", "fanyiAiProvider", "fanyiAiModel", "baiduTranslateFrom", "baiduTranslateTo"]).then(function (items) {
      const domainSettings = items[key];
      state.translateType = domainSettings && domainSettings.translateType || items.fanyiTranslateType || DEFAULT_TRANSLATE_TYPE;
      state.directEngine = domainSettings && domainSettings.directEngine || domainSettings && domainSettings.engine || items.fanyiDirectEngine || items.baiduTranslateEngine || DEFAULT_DIRECT_ENGINE;
      state.aiProvider = domainSettings && domainSettings.aiProvider || items.fanyiAiProvider || DEFAULT_AI_PROVIDER;
      state.aiModel = domainSettings && domainSettings.aiModel || items.fanyiAiModel || DEFAULT_AI_MODEL;
      state.from = domainSettings && domainSettings.from || items.baiduTranslateFrom || DEFAULT_FROM;
      state.to = domainSettings && domainSettings.to || items.baiduTranslateTo || DEFAULT_TO;
      loadDomainSettingsFromServer();
    }).catch(function (error) {
      handleExtensionContextError(error);
    });
  }

  function translateSelected(text, from, to) {
    return sendRuntimeMessage({
      type: state.translateType === "ai" ? "AI_TRANSLATE" : "DIRECT_TRANSLATE",
      engine: state.directEngine || DEFAULT_DIRECT_ENGINE,
      provider: state.aiProvider || DEFAULT_AI_PROVIDER,
      model: state.aiModel || DEFAULT_AI_MODEL,
      text: text,
      from: from,
      to: to
    }).then(function (response) {
      return response.translatedText;
    });
  }

  window.translateWithBaidu = translateSelected;
  loadLanguageSettings();
  init();
}());
