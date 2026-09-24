import axios, { type AxiosError } from 'axios';
import { getProxyAgent } from '../utils/httpAgent';
import { withRetry } from '../utils/retry';
import { LLM_API_KEY, LLM_BASE_URL, LLM_MODELS, LLM_RPM } from '../config';

/**
 * Loi cua nha cung cap nam trong body (vd: "model xyz is not found"), nhung axios chi de
 * "Request failed with status code 404" o message -> keo body ra, khong thi debug bang niem tin.
 * Body chi chua thong bao loi cua API, KHONG chua api key (key nam o header request).
 */
function describeError(err: unknown, model: string): string {
  if (!axios.isAxiosError(err) || !err.response) {
    return err instanceof Error ? err.message : String(err);
  }
  // Gemini goi body loi trong MOT MANG ([{ error: {...} }]) chu khong phai object nhu OpenAI ->
  // khong go lop mang nay thi moi loi deu hien "khong co chi tiet", mat luon ly do that.
  const raw = err.response.data;
  const data = (Array.isArray(raw) ? raw[0] : raw) as
    | { error?: { message?: string } | string }
    | string
    | undefined;
  const detail =
    typeof data === 'string'
      ? data
      : typeof data?.error === 'string'
        ? data.error
        : data?.error?.message;
  if (err.response.status === 429 && isDailyQuotaExhausted(err)) {
    return (
      `Da dung het quota MOI NGAY cua goi free cho TAT CA model dang cau hinh ` +
      `(${LLM_MODELS.join(', ')}). Them model vao LLM_MODEL o server/.env (ngan cach bang dau ` +
      `phay), bat billing, hoac cho sang ngay moi. Chi tiet: ${String(detail ?? '').slice(0, 200)}`
    );
  }
  return `HTTP ${err.response.status} tu ${LLM_BASE_URL} (model ${model}): ${
    String(detail ?? '').slice(0, 300) || 'khong co chi tiet'
  }`;
}

/**
 * 429 het quota NGAY thi doi trong phien nay cung vo ich (den nua dem theo gio Thai Binh Duong
 * moi reset), trong khi Gemini van tra ve retryDelay ~35s nhu the sap hoi phuc -> thu lai chi ton
 * vai phut roi van hong. Nhan dien qua quotaId dang "...PerDay..." de bao loi ngay.
 */
function isDailyQuotaExhausted(err: AxiosError): boolean {
  const raw = err.response?.data;
  const root = Array.isArray(raw) ? raw[0] : raw;
  const details = (root as { error?: { details?: unknown[] } })?.error?.details;
  if (!Array.isArray(details)) return false;
  return details.some((d) =>
    ((d as { violations?: { quotaId?: string }[] }).violations ?? []).some((v) =>
      /PerDay/i.test(v.quotaId ?? ''),
    ),
  );
}

/** 4xx (tru 429) = sai cau hinh (model/key/endpoint) -> thu lai cung the, dung thu cho nhanh. */
function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err) || !err.response) return true; // loi mang -> co the do chap chon
  const s = err.response.status;
  if (s === 429) return !isDailyQuotaExhausted(err);
  return s >= 500;
}

// ===== Tu gioi han toc do goi LLM =====
// Quota free tier tinh theo request/phut. Neu ban het toc do roi trong cho retry thi gan nhu moi
// request deu an 429, va lan thu lai lai roi dung luc dang bi chan nen cang hong. Ep cac lan goi
// cach nhau mot khoang toi thieu de bam sat duoi tran quota: cham hon nhung chay tron ca lo.
const MIN_INTERVAL_MS = Math.ceil(60_000 / LLM_RPM);
let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Xep hang cac lan goi noi tiep nhau, dam bao cach nhau it nhat MIN_INTERVAL_MS. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.catch(() => {}); // loi lan nay khong duoc lam dut hang doi cua lan sau
  return run;
}

/**
 * Goi LLM theo chuan OpenAI /chat/completions.
 * Dung axios + getProxyAgent() thay vi SDK cua tung hang: giu duoc proxy (mang cong ty chan
 * ket noi truc tiep) va doi nha cung cap chi can sua LLM_BASE_URL/LLM_MODEL trong .env.
 * withRetry cho theo dung thoi gian API yeu cau khi dinh 429 (Retry-After hoac body loi).
 */
// Model da het quota ngay -> nho lai de cac lan goi sau khong phi them mot luot hoi nua.
// Chi nho trong bo nho tien trinh: restart server la quen, va quota Google cung reset theo ngay
// nen khong can luu xuong DB.
const exhaustedToday = new Set<string>();

/** Goi 1 model cu the (da kem throttle + retry). */
async function callModel(model: string, system: string, user: string): Promise<string> {
  const res = await withRetry(
    () =>
      throttled(() => {
        const agent = getProxyAgent();
        return axios.post(
          `${LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`,
          {
            model,
            temperature: 0.9, // can do khac biet giua cac lan viet lai
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          },
          {
            timeout: 60_000,
            headers: {
              authorization: `Bearer ${LLM_API_KEY}`,
              'content-type': 'application/json',
            },
            proxy: false, // luon tuong minh, tranh axios tu doc HTTPS_PROXY tu env
            ...(agent ? { httpAgent: agent, httpsAgent: agent } : {}),
          },
        );
      }),
    // 429 duoc cho dung thoi gian API yeu cau nen thu nhieu lan hon van hop ly
    { retries: 4, label: `llm ${model}`, shouldRetry: isRetryable },
  );

  const body = res.data as { choices?: { message?: { content?: string } }[] } | undefined;
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI tra ve rong');
  return text;
}

export async function chatComplete(system: string, user: string): Promise<string> {
  if (!LLM_API_KEY) {
    throw new Error('Chua cau hinh LLM_API_KEY trong server/.env nen khong goi duoc AI');
  }

  const candidates = LLM_MODELS.filter((m) => !exhaustedToday.has(m));
  // Het sach quota o moi model -> van thu lai model dau de lay thong bao loi that tu API,
  // phong truong hop quota da reset ma bo nho cua ta con ghi nham la het.
  const models = candidates.length > 0 ? candidates : LLM_MODELS;

  let lastErr: unknown;
  for (const model of models) {
    try {
      return await callModel(model, system, user);
    } catch (err) {
      lastErr = err;
      const daily = axios.isAxiosError(err) && isDailyQuotaExhausted(err);
      if (!daily) throw new Error(describeError(err, model));
      exhaustedToday.add(model);
      const next = models[models.indexOf(model) + 1];
      console.warn(
        `[llm] ${model} het quota ngay${next ? `, chuyen sang ${next}` : ' (khong con model du phong)'}`,
      );
    }
  }
  throw new Error(describeError(lastErr, models[models.length - 1] ?? ''));
}
