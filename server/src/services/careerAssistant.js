const escapePromptData = (value) => JSON.stringify(value).slice(0, 12000);
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MISSING_KEY_NOTICE = 'The AI assistant is not configured. Set GEMINI_API_KEY in the server environment and restart the backend.';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;
const RETRYABLE_HTTP_STATUSES = new Set([408, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isNetworkError = (error) => {
  const code = error?.code || error?.cause?.code;
  return TRANSIENT_NETWORK_CODES.has(code)
    || (error instanceof TypeError && /fetch failed|failed to fetch|network error/i.test(error.message));
};

const isRetryableRequestError = (error, signal) =>
  !signal.aborted
  && error?.name !== 'TimeoutError'
  && error?.name !== 'AbortError'
  && isNetworkError(error);

const summarizeResponseShape = (payload) => {
  const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload);
  const steps = isObject && Array.isArray(payload.steps) ? payload.steps : null;
  const error = isObject && payload.error && typeof payload.error === 'object'
    ? payload.error
    : null;
  return {
    rootType: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
    fields: isObject ? ['steps', 'output_text', 'output', 'error'].filter((key) => key in payload) : [],
    stepCount: steps?.length,
    modelOutputSteps: steps?.filter((step) => step?.type === 'model_output').length,
    errorFields: error ? ['code', 'status', 'message'].filter((key) => key in error) : [],
    outputTextType: isObject ? typeof payload.output_text : 'undefined',
  };
};

const fetchWithRetry = async (url, options, handleResponse, maxAttempts = MAX_ATTEMPTS) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutError = new DOMException('Gemini request timed out.', 'TimeoutError');
    const timeoutId = setTimeout(() => controller.abort(timeoutError), REQUEST_TIMEOUT_MS);
    let shouldRetry = false;

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < maxAttempts) {
        try {
          await response.body?.cancel();
        } catch {
          // A failed response body should not prevent the bounded retry.
        }
        console.warn(
          `[Career assistant] Gemini returned ${response.status}. Retry ${attempt}/${maxAttempts - 1}.`
        );
        shouldRetry = true;
      } else {
        return await handleResponse(response);
      }
    } catch (error) {
      const requestError = controller.signal.aborted ? timeoutError : error;
      if (!isRetryableRequestError(requestError, controller.signal) || attempt === maxAttempts) {
        throw requestError;
      }
      console.warn(
        `[Career assistant] Gemini request failed (${requestError.name || 'network error'}). Retry ${attempt}/${maxAttempts - 1}.`
      );
      shouldRetry = true;
    } finally {
      clearTimeout(timeoutId);
    }

    if (shouldRetry && attempt < maxAttempts) {
      await sleep(RETRY_DELAY_MS);
    }
  }
};


const getFailureNotice = (error) => {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'Gemini timed out while preparing a response. Please try again.';
  }
  if (isNetworkError(error)) {
    return 'Gemini could not be reached. Please check your connection and try again later.';
  }
  switch (error?.status) {
    case 400:
    case 404:
      return 'The configured Gemini model is unavailable or unsupported. Check GEMINI_MODEL in the server environment.';
    case 401:
    case 403:
      return 'Gemini could not authenticate the server configuration. Check GEMINI_API_KEY and its API access.';
    case 429:
      return 'Gemini is temporarily rate-limited. Please try again in a minute.';
    default:
      return 'The AI assistant is temporarily unavailable. Please try again later.';
  }
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const redactProviderMessage = (message, sensitiveValues) => {
  let safeMessage = message.slice(0, 1000);
  for (const value of sensitiveValues) {
    if (value.length >= 3) {
      safeMessage = safeMessage.replace(new RegExp(escapeRegExp(value), 'gi'), '[redacted]');
    }
  }
  return safeMessage
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[redacted key]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]');
};

const collectStringValues = (value, values = new Set()) => {
  if (typeof value === 'string') {
    values.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectStringValues(entry, values));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectStringValues(entry, values));
  }
  return values;
};

export const generateCareerResponse = async ({ message, candidateSkills, applications, openJobs }) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  if (!apiKey) return { reply: MISSING_KEY_NOTICE, mode: 'error' };
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    console.warn('[Career assistant] Invalid Gemini model configuration.');
    return {
      reply: getFailureNotice({ status: 404 }),
      mode: 'error',
    };
  }

  let failedModel = model;
  try {
    const requestInput = `Candidate context: ${escapePromptData({ candidateSkills, applications, openJobs })}\nQuestion: ${message.slice(0, 1200)}`;
    const sensitiveValues = collectStringValues({
      message,
      candidateSkills,
      applications,
      openJobs,
    });
    sensitiveValues.add(apiKey);
    const requestWithModel = (requestedModel, maxAttempts = MAX_ATTEMPTS) =>
      fetchWithRetry(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: requestedModel,
          store: false,
          system_instruction: 'You are JobOrbit Career Assistant. Give concise, practical career guidance, including career questions, gap-year explanations, cover letters, resume improvements, interview preparation, and job/career guidance. Use only supplied candidate/application/job context for personal claims. Never claim an application changed, invent job requirements, guarantee outcomes, or expose private information. If context is insufficient, say what is missing.',
          input: requestInput,
          generation_config: { thinking_level: 'low', temperature: 0.4, max_output_tokens: 800 },
        }),
      }, async (response) => {
        if (!response.ok) {
          const responseBody = await response.text();
          let providerBody;
          try {
            providerBody = JSON.parse(responseBody);
          } catch {
            providerBody = null;
          }
          const providerError = new Error('Gemini request failed.');
          providerError.model = requestedModel;
          providerError.status = response.status;
          providerError.providerStatus = providerBody?.error?.status;
          providerError.providerMessage = typeof providerBody?.error?.message === 'string'
            ? redactProviderMessage(providerBody.error.message, sensitiveValues)
            : undefined;
          providerError.responseShape = summarizeResponseShape(providerBody);
          providerError.responseContentType = response.headers.get('content-type') || undefined;
          providerError.responseBodyLength = Buffer.byteLength(responseBody);
          throw providerError;
        }
        const payload = await response.json();
        const responseShape = summarizeResponseShape(payload);
        const stepReply = (Array.isArray(payload?.steps) ? payload.steps : [])
          .filter((step) => step?.type === 'model_output')
          .flatMap((step) => Array.isArray(step.content) ? step.content : [])
          .map((part) => part.text)
          .filter((part) => typeof part === 'string')
          .join('')
          ;
        const reply = (typeof payload?.output_text === 'string' ? payload.output_text : stepReply).trim();
        if (!reply || reply.length > 4000) {
          const invalidResponse = new Error('empty or invalid provider response');
          invalidResponse.model = requestedModel;
          invalidResponse.responseShape = responseShape;
          throw invalidResponse;
        }
        return { reply, mode: 'ai' };
      }, maxAttempts);

    try {
      return await requestWithModel(model);
    } catch (error) {
      const shouldFallback = RETRYABLE_HTTP_STATUSES.has(error?.status)
        || error?.name === 'TimeoutError'
        || error?.name === 'AbortError';
      if (!shouldFallback) throw error;
      failedModel = FALLBACK_GEMINI_MODEL;
      console.warn(
        `[Career assistant] Gemini model ${model} remains unavailable (${error?.status || error?.name}). Trying ${FALLBACK_GEMINI_MODEL}.`
      );
      return await requestWithModel(FALLBACK_GEMINI_MODEL, 1);
    }
  } catch (error) {
    const notice = getFailureNotice(error);
    console.warn('[Career assistant] Gemini request failed.', {
      providerStatus: error?.status,
      providerCode: error?.providerStatus,
      providerMessage: error?.providerMessage,
      model: error?.model || failedModel,
      responseShape: error?.responseShape,
      responseContentType: error?.responseContentType,
      responseBodyLength: error?.responseBodyLength,
      status: Number.isInteger(error?.status) ? error.status : undefined,
      reason: error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'timeout'
        : isNetworkError(error) ? 'network' : 'provider',
    });
    return {
      reply: notice,
      mode: 'error',
    };
  }
};
