const FANYI_API_URL = "https://www.gofruxa.com/fanyi/api.php";

chrome.runtime.onInstalled.addListener(function () {
  console.log("划词百度翻译插件已安装，请在选项页登录并配置百度翻译 API。", chrome.runtime.getManifest().version);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) {
    return false;
  }

  handleMessage(message)
    .then(function (response) {
      sendResponse(response);
    })
    .catch(function (error) {
      sendResponse({ ok: false, error: error.message || "翻译失败" });
    });

  return true;
});

async function handleMessage(message) {
  if (message.type === "DIRECT_TRANSLATE") {
    const translatedText = await translateDirect(message.text, message.from, message.to, message.engine);
    return { ok: true, translatedText: translatedText };
  }
  if (message.type === "AI_TRANSLATE") {
    const translatedText = await translateWithAi(message.text, message.from, message.to, message.provider, message.model);
    return { ok: true, translatedText: translatedText };
  }
  if (message.type === "BAIDU_TRANSLATE") {
    const translatedText = await translateWithServer(message.text, message.from, message.to);
    return { ok: true, translatedText: translatedText };
  }
  if (message.type === "FANYI_LOGIN" || message.type === "FANYI_REGISTER") {
    return loginOrRegister(message.type === "FANYI_REGISTER" ? "register" : "login", message.email, message.password);
  }
  if (message.type === "FANYI_ME") {
    return requestServer("me", {}, true);
  }
  if (message.type === "FANYI_IMPORT_CREDENTIALS") {
    return importCredentialsFromServer();
  }
  if (message.type === "FANYI_SAVE_CREDENTIALS") {
    return requestServer("save_credentials", { app_id: message.appId, secret_key: message.secretKey }, true);
  }
  if (message.type === "FANYI_SAVE_NVIDIA_CREDENTIALS") {
    const apiKey = normalizeNvidiaApiKey(message.apiKey || "");
    if (!apiKey) {
      throw new Error("请填写 NVIDIA API Key");
    }
    await chrome.storage.local.set({ fanyiNvidiaApiKey: apiKey });
    return requestServer("save_nvidia_credentials", { api_key: apiKey }, true);
  }
  if (message.type === "FANYI_GET_DOMAIN_SETTINGS") {
    return requestServer("get_domain_settings", { domain: message.domain }, true);
  }
  if (message.type === "FANYI_SAVE_DOMAIN_SETTINGS") {
    return requestServer("save_domain_settings", { domain: message.domain, translate_type: message.translateType, direct_engine: message.directEngine, ai_provider: message.aiProvider, ai_model: message.aiModel, engine: message.directEngine, from: message.from, to: message.to }, true);
  }
  if (message.type === "FANYI_STORAGE_GET") {
    return chrome.storage.local.get(message.keys || null).then(function (items) {
      return { ok: true, items: items || {} };
    });
  }
  if (message.type === "FANYI_STORAGE_SET") {
    return chrome.storage.local.set(message.items || {}).then(function () {
      return { ok: true };
    });
  }
  throw new Error("未知消息类型");
}

async function translateDirect(text, from, to, engine) {
  if ((engine || "baidu") === "google") {
    return translateWithGoogleFree(text, from, to);
  }
  return translateWithServer(text, from, to);
}

async function loginOrRegister(action, email, password) {
  const data = await requestServer(action, { email: email, password: password }, false);
  if (data.token) {
    await chrome.storage.local.set({ fanyiAuthToken: data.token, fanyiEmail: data.email || email });
    await importCredentialsFromServer().catch(function () {
      return null;
    });
  }
  return data;
}

async function importCredentialsFromServer() {
  const data = await requestServer("credentials", {}, true);
  const items = {
    fanyiCredentialsImportedAt: Date.now()
  };
  if (data.baidu_app_id) {
    items.fanyiBaiduAppId = data.baidu_app_id;
  }
  if (data.baidu_secret_key) {
    items.fanyiBaiduSecretKey = data.baidu_secret_key;
  }
  if (data.nvidia_api_key) {
    items.fanyiNvidiaApiKey = normalizeNvidiaApiKey(data.nvidia_api_key);
  }
  await chrome.storage.local.set(items);
  return {
    ok: true,
    has_baidu_credentials: !!data.baidu_app_id && !!data.baidu_secret_key,
    has_nvidia_credentials: !!data.nvidia_api_key,
    baidu_app_id: data.baidu_app_id || ""
  };
}

async function requestServer(action, body, requireToken) {
  const headers = { "Content-Type": "application/json" };
  if (requireToken) {
    const session = await chrome.storage.local.get(["fanyiAuthToken"]);
    const token = session.fanyiAuthToken || "";
    if (!token) {
      throw new Error("NEED_LOGIN");
    }
    headers.Authorization = "Bearer " + token;
  }

  let response;
  try {
    response = await fetch(FANYI_API_URL + "?action=" + encodeURIComponent(action), {
      method: "POST",
      cache: "no-store",
      headers: headers,
      body: JSON.stringify(body || {})
    });
  } catch (error) {
    throw new Error("无法连接 GOFRUXA 翻译服务，请检查网络或稍后重试");
  }

  const data = await response.json().catch(function () {
    return { ok: false, error: "翻译服务返回格式异常" };
  });
  if (!response.ok || !data.ok) {
    throw new Error(data.error || ("翻译服务请求失败：HTTP " + response.status));
  }
  return data;
}

async function translateWithServer(text, from, to) {
  const query = String(text || "").trim();
  if (!query) {
    throw new Error("翻译内容为空");
  }

  const data = await requestServer("translate", { text: query, from: from || "auto", to: to || "zh" }, true);
  return data.translatedText || "";
}

async function translateWithAi(text, from, to, provider, model) {
  const query = String(text || "").trim();
  if (!query) {
    throw new Error("翻译内容为空");
  }
  if ((provider || "nvidia") !== "nvidia") {
    throw new Error("暂时只支持 NVIDIA AI 翻译");
  }
  const local = await chrome.storage.local.get(["fanyiNvidiaApiKey"]);
  if (local.fanyiNvidiaApiKey) {
    return translateWithNvidiaDirect(query, from, to, model, local.fanyiNvidiaApiKey);
  }
  const data = await requestServer("ai_translate", { text: query, from: from || "auto", to: to || "zh", provider: "nvidia", model: model || "nvidia/llama-3.3-nemotron-super-49b-v1.5" }, true);
  return data.translatedText || "";
}

async function translateWithNvidiaDirect(text, from, to, model, apiKey) {
  const normalizedKey = normalizeNvidiaApiKey(apiKey || "");
  if (!normalizedKey) {
    throw new Error("请先保存 NVIDIA API Key");
  }

  const models = buildNvidiaModelFallbacks(model);
  let lastError = null;
  for (const modelName of models) {
    try {
      return await requestNvidiaModel(text, from, to, modelName, normalizedKey);
    } catch (error) {
      lastError = error;
      if (!isRetryableNvidiaModelError(error)) {
        throw error;
      }
    }
  }
  throw lastError || new Error("NVIDIA 云模型调用失败");
}

async function requestNvidiaModel(text, from, to, model, apiKey) {
  let response;
  try {
    response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: model || "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        messages: [
          {
            role: "system",
            content: "You are a professional translation engine. Translate the user text to the target language. Return only the translated text, no explanation. Preserve meaning, tone, line breaks and formatting."
          },
          {
            role: "user",
            content: "Target language: " + (to || "zh") + "\nSource language: " + (from || "auto") + "\nText:\n" + text
          }
        ],
        temperature: 0.1,
        max_tokens: 2048,
        stream: false
      })
    });
  } catch (error) {
    throw new Error("浏览器无法连接 NVIDIA 云模型接口，请检查网络或稍后重试：" + (error.message || error));
  }

  const data = await response.json().catch(function () {
    return null;
  });
  if (!response.ok) {
    const detail = data && (data.detail || data.title || data.error && data.error.message) || ("HTTP " + response.status);
    if (response.status === 401 || response.status === 403) {
      throw new Error("NVIDIA API Key 鉴权失败：请确认 Key 有效，且不要重复填写 Bearer 前缀");
    }
    throw new Error("NVIDIA 云模型错误：" + detail);
  }

  const translatedText = extractAiText(data);
  if (!translatedText) {
    throw new Error("NVIDIA 云模型未返回译文");
  }
  return translatedText;
}

function buildNvidiaModelFallbacks(selectedModel) {
  const defaults = [
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "qwen/qwen3.5-122b-a10b",
    "qwen/qwen3-coder-480b-a35b-instruct"
  ];
  const normalized = selectedModel || defaults[0];
  return [normalized].concat(defaults.filter(function (item) {
    return item !== normalized;
  }));
}

function isRetryableNvidiaModelError(error) {
  const message = error && error.message ? error.message : String(error || "");
  return message.indexOf("DEGRADED") !== -1 || message.indexOf("cannot be invoked") !== -1 || message.indexOf("temporarily") !== -1 || message.indexOf("HTTP 429") !== -1 || message.indexOf("HTTP 500") !== -1 || message.indexOf("HTTP 503") !== -1;
}

function normalizeNvidiaApiKey(apiKey) {
  return String(apiKey || "").trim().replace(/^Bearer\s+/i, "").trim();
}

function extractAiText(data) {
  const choice = data && data.choices && data.choices[0];
  if (choice && choice.message) {
    const content = choice.message.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content.map(function (item) {
        if (typeof item === "string") return item;
        if (item && item.text) return item.text;
        return "";
      }).join("\n").trim();
      if (text) return text;
    }
    if (choice.message.reasoning_content) {
      return String(choice.message.reasoning_content).trim();
    }
  }
  if (choice && choice.text) {
    return String(choice.text).trim();
  }
  if (data && data.output_text) {
    return String(data.output_text).trim();
  }
  return "";
}

async function translateWithGoogleFree(text, from, to) {
  const query = String(text || "").trim();
  if (!query) {
    throw new Error("翻译内容为空");
  }

  const source = normalizeGoogleLanguage(from || "auto");
  const target = normalizeGoogleLanguage(to || "zh");
  const params = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: query
  });

  let response;
  try {
    response = await fetch("https://translate.googleapis.com/translate_a/single?" + params.toString(), {
      method: "GET",
      cache: "no-store"
    });
  } catch (error) {
    throw new Error("无法连接 Google 非官方翻译接口，请切换百度或稍后重试");
  }

  const data = await response.json().catch(function () {
    return null;
  });
  if (!response.ok || !Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Google 非官方翻译接口返回异常，请切换百度或稍后重试");
  }

  const translatedText = data[0].map(function (item) {
    return Array.isArray(item) && item[0] ? item[0] : "";
  }).join("").trim();
  if (!translatedText) {
    throw new Error("Google 非官方翻译接口未返回译文");
  }
  return translatedText;
}

function normalizeGoogleLanguage(language) {
  const map = {
    auto: "auto",
    zh: "zh-CN",
    jp: "ja",
    kor: "ko",
    fra: "fr",
    spa: "es",
    ara: "ar",
    vie: "vi"
  };
  return map[language] || language || "auto";
}