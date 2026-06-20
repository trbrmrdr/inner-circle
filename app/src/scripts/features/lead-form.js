(function () {
  const formSelector = 'form[name="inner-circle-request"][data-lead-form="inner-circle"]';
  const recaptchaScriptUrl = "https://www.google.com/recaptcha/api.js?render=explicit";
  let recaptchaScriptPromise = null;
  let activeSubmitTransition = "none";
  const recaptchaStates = new WeakMap();
  const enhancedForms = new WeakSet();
  const submittingForms = new WeakSet();

  function splitList(value) {
    return String(value || "")
      .split(/[,\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeEndpoint(endpoint) {
    try {
      return new URL(endpoint, window.location.origin).toString();
    } catch {
      return "";
    }
  }

  function isEndpointAllowed(endpoint) {
    if (!endpoint) return false;
    try {
      const url = new URL(endpoint);
      return !(window.location.protocol === "https:" && url.protocol === "http:");
    } catch {
      return false;
    }
  }

  function isLocalDevHost() {
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(window.location.hostname);
  }

  function getEndpoints(form) {
    if (isLocalDevHost()) {
      const localEndpoint = normalizeEndpoint(form.action || "/api/lead");
      return isEndpointAllowed(localEndpoint) ? [localEndpoint] : [];
    }

    const endpoints = splitList(form.dataset.leadEndpoints || form.action)
      .map(normalizeEndpoint)
      .filter(isEndpointAllowed);
    return Array.from(new Set(endpoints));
  }

  function formatRussianPhone(value) {
    const digits = normalizePhoneDigits(value);
    if (!digits) return "";

    const code = digits.slice(1, 4);
    const first = digits.slice(4, 7);
    const second = digits.slice(7, 9);
    const third = digits.slice(9, 11);

    return [
      "+7",
      code ? ` ${code}` : "",
      first ? ` ${first}` : "",
      second ? `-${second}` : "",
      third ? `-${third}` : "",
    ].join("");
  }

  function normalizePhoneDigits(value) {
    const rawDigits = String(value || "").replace(/\D/g, "");
    if (!rawDigits) return "";

    let digits = rawDigits;
    if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
    if (digits.startsWith("9")) digits = `7${digits}`;
    if (!digits.startsWith("7")) digits = `7${digits}`;
    return digits.slice(0, 11);
  }

  function normalizeGuests(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 3);
  }

  function isValidDateValue(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }

  function telegramUsername(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const withoutProtocol = raw.replace(/^https?:\/\//i, "");
    const withoutHost = withoutProtocol.replace(/^(t\.me|telegram\.me)\//i, "");
    const withoutAt = withoutHost.replace(/^@/, "");
    return withoutAt.split(/[/?#]/)[0].trim();
  }

  function normalizeTelegram(value) {
    const username = telegramUsername(value);
    return username ? `@${username}` : "";
  }

  function isTelegramValid(value) {
    const raw = String(value || "").trim();
    if (!raw) return true;
    return /^[A-Za-z0-9_]{5,32}$/.test(telegramUsername(raw));
  }

  function initPhoneMask(form) {
    const phone = form.querySelector('input[name="phone"]');
    if (!phone) return;

    phone.addEventListener("input", () => {
      phone.value = formatRussianPhone(phone.value);
    });

    phone.addEventListener("blur", () => {
      phone.value = formatRussianPhone(phone.value);
    });
  }

  function initTelegramField(form) {
    const telegram = form.querySelector('input[name="telegram"]');
    if (!telegram) return;

    telegram.addEventListener("blur", () => {
      telegram.value = normalizeTelegram(telegram.value);
    });
  }

  function initDateField(form) {
    const date = form.querySelector('input[name="date"][type="date"]');
    if (!date || date.closest(".lead-date-control")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "lead-date-control";

    const button = document.createElement("button");
    button.className = "lead-date-control__button";
    button.type = "button";
    button.setAttribute("aria-label", "Открыть календарь");
    button.innerHTML = [
      '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">',
      '<path d="M8 2v4M16 2v4M3.5 9.5h17M5.5 4.5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2Z" />',
      '<path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" />',
      "</svg>",
    ].join("");

    date.parentNode.insertBefore(wrapper, date);
    wrapper.append(date, button);

    button.addEventListener("click", () => {
      date.focus({ preventScroll: true });
      if (typeof date.showPicker === "function") {
        try {
          date.showPicker();
          return;
        } catch {
          // The picker can be blocked by the browser if the input is not ready.
        }
      }
      date.click();
    });
  }

  function initGuestsControl(form) {
    const input = form.querySelector('input[name="guests"]');
    if (!input || input.closest(".lead-guests-control")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "lead-guests-control";

    const decrease = document.createElement("button");
    decrease.className = "lead-guests-control__button";
    decrease.type = "button";
    decrease.setAttribute("aria-label", "Уменьшить количество гостей");
    decrease.textContent = "-";

    const increase = document.createElement("button");
    increase.className = "lead-guests-control__button";
    increase.type = "button";
    increase.setAttribute("aria-label", "Увеличить количество гостей");
    increase.textContent = "+";

    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(decrease, input, increase);

    input.addEventListener("input", () => {
      input.value = normalizeGuests(input.value);
    });

    decrease.addEventListener("click", () => {
      const current = Number(normalizeGuests(input.value) || 0);
      input.value = current > 1 ? String(current - 1) : "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });

    increase.addEventListener("click", () => {
      const current = Number(normalizeGuests(input.value) || 0);
      input.value = String(current + 1);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
  }

  function initLeadForm(form) {
    if (enhancedForms.has(form)) return;
    enhancedForms.add(form);
    initPhoneMask(form);
    initTelegramField(form);
    initDateField(form);
    initGuestsControl(form);

    form.addEventListener("input", (event) => {
      if (!(event.target instanceof Element)) return;
      event.target.removeAttribute("aria-invalid");
      event.target.closest("label[aria-invalid='true']")?.removeAttribute("aria-invalid");
      if (event.target.matches('input[name="phone"], input[name="email"], input[name="telegram"]')) {
        form.querySelector('input[name="phone"]')?.removeAttribute("aria-invalid");
        form.querySelector('input[name="email"]')?.removeAttribute("aria-invalid");
        form.querySelector('input[name="telegram"]')?.removeAttribute("aria-invalid");
      }
    });
    form.addEventListener("change", (event) => {
      if (!(event.target instanceof Element)) return;
      event.target.removeAttribute("aria-invalid");
      event.target.closest("label[aria-invalid='true']")?.removeAttribute("aria-invalid");
      if (event.target.matches('input[name="phone"], input[name="email"], input[name="telegram"]')) {
        form.querySelector('input[name="phone"]')?.removeAttribute("aria-invalid");
        form.querySelector('input[name="email"]')?.removeAttribute("aria-invalid");
        form.querySelector('input[name="telegram"]')?.removeAttribute("aria-invalid");
      }
    });
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function scrollElementIntoView(element) {
    if (!element) return;
    const target = element.closest("label") || element.closest(".lead-date-control, .lead-guests-control") || element;
    const rect = target.getBoundingClientRect();
    const offset = Math.max(32, Math.round(window.innerHeight * 0.33));
    const top = Math.max(0, window.scrollY + rect.top - offset);
    window.scrollTo({
      top,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function focusField(field) {
    if (!field || typeof field.focus !== "function") return;
    if (field instanceof HTMLInputElement && field.type === "checkbox") return;
    try {
      field.focus({ preventScroll: true });
    } catch {
      field.focus();
    }
  }

  function markValidationError(validationError) {
    const fields = validationError.fields || [validationError.field].filter(Boolean);
    fields.forEach((field) => field.setAttribute("aria-invalid", "true"));

    const field = validationError.field || fields[0];
    if (!field) return;
    scrollElementIntoView(field);
    focusField(field);
  }

  function shouldShowValidationMessage(validationError) {
    return Boolean(validationError && validationError.message);
  }

  function getNativeLoader() {
    return document.querySelector("._a7f9b9");
  }

  function getRuntime() {
    const runtime = window.InnerCircleRuntime;
    if (!runtime || typeof runtime.showLeadSubmitTransition !== "function") return null;
    return runtime;
  }

  function waitForRuntime(timeout = 5000) {
    const runtime = getRuntime();
    if (runtime) return Promise.resolve(runtime);

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("inner-circle-runtime-ready", onReady);
        resolve(getRuntime());
      }, timeout);

      function onReady() {
        window.clearTimeout(timer);
        window.removeEventListener("inner-circle-runtime-ready", onReady);
        resolve(getRuntime());
      }

      window.addEventListener("inner-circle-runtime-ready", onReady, { once: true });
    });
  }

  async function showNativeSubmitLoader() {
    const loader = getNativeLoader();
    if (!loader) return null;

    const text = loader.querySelector("._bd2a67");
    if (text && !text.dataset.originalText) text.dataset.originalText = text.textContent || "";
    if (text) text.textContent = "Отправка заявки";

    loader.classList.add("lead-submit-native-loader");
    loader.style.display = "grid";
    document.body.classList.add("lead-submit-native-active");
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    loader.classList.add("is-active");
    await wait(prefersReducedMotion() ? 0 : 220);
    return loader;
  }

  async function hideNativeSubmitLoader() {
    const loader = getNativeLoader();
    if (!loader) return;

    loader.classList.remove("is-active");
    document.body.classList.remove("lead-submit-native-active");
    await wait(prefersReducedMotion() ? 0 : 260);
    if (!loader.classList.contains("is-active")) {
      const text = loader.querySelector("._bd2a67");
      if (text && text.dataset.originalText) text.textContent = text.dataset.originalText;
      loader.classList.remove("lead-submit-native-loader");
      loader.style.display = "none";
    }
  }

  async function showSubmitTransition() {
    const runtime = await waitForRuntime();
    if (runtime) {
      activeSubmitTransition = "runtime";
      await runtime.showLeadSubmitTransition("Отправка заявки");
      return;
    }

    activeSubmitTransition = "native";
    await showNativeSubmitLoader();
  }

  async function hideSubmitTransition() {
    if (activeSubmitTransition === "runtime") {
      const runtime = getRuntime();
      if (runtime && typeof runtime.hideLeadSubmitTransition === "function") {
        await runtime.hideLeadSubmitTransition();
      }
    } else if (activeSubmitTransition === "native") {
      await hideNativeSubmitLoader();
    }

    activeSubmitTransition = "none";
  }

  async function completeSubmitTransition(form) {
    const redirectPath = form.dataset.redirectPath || "/ru/form-successfully-submitted/";

    if (activeSubmitTransition === "runtime") {
      const runtime = getRuntime();
      if (runtime && typeof runtime.completeLeadSubmitTransition === "function") {
        await runtime.completeLeadSubmitTransition(redirectPath);
        activeSubmitTransition = "none";
        return;
      }
    }

    activeSubmitTransition = "none";
    redirectAfterSuccess(form);
  }

  function loadRecaptcha() {
    if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
      return Promise.resolve(window.grecaptcha);
    }

    if (recaptchaScriptPromise) return recaptchaScriptPromise;

    recaptchaScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src^="${recaptchaScriptUrl}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.grecaptcha), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = recaptchaScriptUrl;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.grecaptcha);
      script.onerror = reject;
      document.head.appendChild(script);
    });

    return recaptchaScriptPromise;
  }

  async function ensureRecaptchaState(form) {
    const siteKey = form.dataset.recaptchaSiteKey || "";
    if (!siteKey) return null;

    const grecaptcha = await loadRecaptcha();
    await new Promise((resolve) => grecaptcha.ready(resolve));

    const current = recaptchaStates.get(form);
    if (current) return current;

    const node = document.createElement("div");
    node.className = "inner-circle-recaptcha";
    form.appendChild(node);

    const state = {
      widgetId: null,
      resolve: null,
      reject: null,
    };

    state.widgetId = grecaptcha.render(node, {
      sitekey: siteKey,
      size: "invisible",
      badge: form.dataset.recaptchaBadge || "bottomright",
      callback: (token) => {
        const resolve = state.resolve;
        state.resolve = null;
        state.reject = null;
        if (resolve) resolve(token);
      },
      "expired-callback": () => {
        const reject = state.reject;
        state.resolve = null;
        state.reject = null;
        if (reject) reject(new Error("reCAPTCHA expired"));
      },
      "error-callback": () => {
        const reject = state.reject;
        state.resolve = null;
        state.reject = null;
        if (reject) reject(new Error("reCAPTCHA failed"));
      },
    });

    recaptchaStates.set(form, state);
    return state;
  }

  async function getCaptchaToken(form) {
    const state = await ensureRecaptchaState(form);
    if (!state) return "";

    const grecaptcha = window.grecaptcha;
    grecaptcha.reset(state.widgetId);

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        state.resolve = null;
        state.reject = null;
        reject(new Error("reCAPTCHA timeout"));
      }, 30000);

      state.resolve = (token) => {
        window.clearTimeout(timeout);
        resolve(token);
      };
      state.reject = (error) => {
        window.clearTimeout(timeout);
        reject(error);
      };

      grecaptcha.execute(state.widgetId);
    });
  }

  function readForm(form, endpoint, captchaToken) {
    const data = new FormData(form);
    const date = String(data.get("date") || "").trim();
    const guests = normalizeGuests(data.get("guests"));
    const scenario = String(data.get("scenario") || "").trim();
    const phone = normalizePhoneDigits(data.get("phone"));
    const telegram = normalizeTelegram(data.get("telegram"));

    return {
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone,
      telegram,
      date,
      guests,
      scenario,
      consent: data.has("consent"),
      captchaToken,
      meta: {
        apiEndpoint: endpoint,
        formName: form.name || "",
        language: document.documentElement.lang || "ru",
        referrer: document.referrer || "",
        userAgent: window.navigator.userAgent,
      },
    };
  }

  function validateLeadForm(form) {
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phoneRaw = String(data.get("phone") || "").trim();
    const phone = normalizePhoneDigits(phoneRaw);
    const telegramRaw = String(data.get("telegram") || "").trim();
    const date = String(data.get("date") || "").trim();
    const guests = normalizeGuests(data.get("guests"));
    const scenario = String(data.get("scenario") || "").trim();
    const consent = data.has("consent");
    const dateField = form.querySelector('input[name="date"]');

    form.querySelectorAll("[aria-invalid='true']").forEach((node) => {
      node.removeAttribute("aria-invalid");
    });

    if (!name) {
      return {
        field: form.querySelector('input[name="name"]'),
        message: "Укажите имя, чтобы мы понимали, как к вам обращаться.",
      };
    }

    if (!email && !phoneRaw && !telegramRaw) {
      const phoneField = form.querySelector('input[name="phone"]');
      return {
        field: phoneField,
        fields: [phoneField].filter(Boolean),
        message: "Укажите телефон, Telegram или почту, чтобы мы могли связаться.",
      };
    }

    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) {
      return {
        field: form.querySelector('input[name="email"]'),
        message: "Это не похоже на e-mail. Проверьте адрес.",
      };
    }

    if (phoneRaw && (phone.length !== 11 || !phone.startsWith("7"))) {
      return {
        field: form.querySelector('input[name="phone"]'),
        message: "В телефоне не хватает цифр. Введите номер полностью или укажите Telegram/почту.",
      };
    }

    if (telegramRaw && !isTelegramValid(telegramRaw)) {
      return {
        field: form.querySelector('input[name="telegram"]'),
        message: "Проверьте Telegram: укажите @username или ссылку t.me/username.",
      };
    }

    if (!date || dateField?.validity?.badInput || !isValidDateValue(date)) {
      return {
        field: dateField,
        message: "Укажите реальную желаемую дату заезда.",
      };
    }

    if (!guests || Number(guests) < 1) {
      return {
        field: form.querySelector('input[name="guests"]'),
        message: "Укажите количество гостей, например 1-2 человека.",
      };
    }

    if (!scenario) {
      return {
        field: form.querySelector('textarea[name="scenario"]'),
        message: "Напишите коротко, что должно произойти, чтобы было понятно, о чем разговаривать.",
      };
    }

    if (!consent) {
      const consentField = form.querySelector('input[name="consent"]');
      const consentLabel = consentField ? consentField.closest("label") : null;
      return {
        field: consentField,
        fields: [consentField, consentLabel].filter(Boolean),
        message: "Подтвердите согласие, чтобы мы могли связаться по заявке.",
      };
    }

    return null;
  }

  async function postLead(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }

    return { response, data };
  }

  function setStatus(form, message) {
    const wrapper = form.closest("._75ecff");
    const status = wrapper ? wrapper.querySelector("._695ee5") : null;
    if (status) status.textContent = message || "";
  }

  function setSubmitting(form, isSubmitting) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent || "";
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? (form.dataset.sendingText || "Отправляем...") : button.dataset.originalText;
  }

  function redirectAfterSuccess(form) {
    const redirectPath = form.dataset.redirectPath || "/ru/form-successfully-submitted/";
    window.location.assign(redirectPath);
  }

  async function submitLeadForm(form) {
    const endpoints = getEndpoints(form);
    if (endpoints.length === 0) throw new Error("Lead endpoint is not configured");

    let accepted = null;
    let lastMessage = "";

    for (const endpoint of endpoints) {
      try {
        const captchaToken = await getCaptchaToken(form);
        const payload = readForm(form, endpoint, captchaToken);
        const { response, data } = await postLead(endpoint, payload);

        if (response.ok && data && data.accepted) accepted = data;
        if (response.ok && data && data.ok && data.shouldFallback !== true) return data;
        if (response.ok && data && data.accepted && data.shouldFallback !== true) return data;

        lastMessage = data?.message || `Endpoint failed: ${endpoint}`;
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : String(error);
      }
    }

    if (accepted) return accepted;
    throw new Error(lastMessage || "Не удалось отправить заявку");
  }

  document.addEventListener("submit", async (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || !form.matches(formSelector)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    initLeadForm(form);
    if (submittingForms.has(form)) return;

    const validationError = validateLeadForm(form);
    if (validationError) {
      markValidationError(validationError);
      setStatus(form, shouldShowValidationMessage(validationError) ? validationError.message : "");
      return;
    }

    setStatus(form, "");
    submittingForms.add(form);
    setSubmitting(form, true);

    const transitionPromise = showSubmitTransition();

    try {
      await Promise.all([transitionPromise, submitLeadForm(form)]);
      form.reset();
      await completeSubmitTransition(form);
    } catch (error) {
      await transitionPromise.catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      setStatus(form, message);
      submittingForms.delete(form);
      setSubmitting(form, false);
      await hideSubmitTransition();
      const wrapper = form.closest("._75ecff");
      const status = wrapper ? wrapper.querySelector("._695ee5") : null;
      scrollElementIntoView(status || form);
    }
  }, true);

  document.addEventListener("focusin", (event) => {
    const form = event.target instanceof Element ? event.target.closest(formSelector) : null;
    if (form) initLeadForm(form);
  });

  document.addEventListener("pointerdown", (event) => {
    const form = event.target instanceof Element ? event.target.closest(formSelector) : null;
    if (form) initLeadForm(form);
  });

  document.querySelectorAll(formSelector).forEach(initLeadForm);
})();
