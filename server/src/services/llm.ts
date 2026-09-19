import axios from 'axios';
import { getProxyAgent } from '../utils/httpAgent';
import { withRetry } from '../utils/retry';
import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } from '../config';

/**
 * Loi cua nha cung cap nam trong body (vd: "model xyz is not found"), nhung axios chi de
 * "Request failed with status code 404" o message -> keo body ra, khong thi debug bang niem tin.
 * Body chi chua thong bao loi cua API, KHONG chua api key (key nam o header request).
 */
function describeError(err: unknown): string {
  if (!axios.isAxiosError(err) || !err.response) {
    return err instanceof Error ? err.message : String(err);
  }
  const data = err.response.data as { error?: { message?: string } | string } | string | undefined;
  const detail =
    typeof data === 'string'
      ? data
      : typeof data?.error === 'string'
        ? data.error
        : data?.error?.message;
  return `HTTP ${err.response.status} tu ${LLM_BASE_URL} (model ${LLM_MODEL}): ${
    String(detail ?? '').slice(0, 300) || 'khong co chi tiet'
  }`;
}

/** 4xx (tru 429) = sai cau hinh (model/key/endpoint) -> thu lai cung the, dung thu cho nhanh. */
function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err) || !err.response) return true; // loi mang -> co the do chap chon
  const s = err.response.status;
  return s === 429 || s >= 500;
}

/**
 * Goi LLM theo chuan OpenAI /chat/completions.
 * Dung axios + getProxyAgent() thay vi SDK cua tung hang: giu duoc proxy (mang cong ty chan
 * ket noi truc tiep) va doi nha cung cap chi can sua LLM_BASE_URL/LLM_MODEL trong .env.
 * withRetry da xu ly rieng loi 429 (cho theo Retry-After) - dung thu free tier hay tra ve.
 */
export async function chatComplete(system: string, user: string): Promise<string> {
  if (!LLM_API_KEY) {
    throw new Error('Chua cau hinh LLM_API_KEY trong server/.env nen khong goi duoc AI');
  }

  try {
    const res = await withRetry(
      () => {
        const agent = getProxyAgent();
        return axios.post(
          `${LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`,
          {
            model: LLM_MODEL,
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
      },
      { retries: 2, label: 'llm', shouldRetry: isRetryable },
    );

    const body = res.data as { choices?: { message?: { content?: string } }[] } | undefined;
    const text = body?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('AI tra ve rong');
    return text;
  } catch (err) {
    throw new Error(describeError(err));
  }
}
