import axios, { AxiosRequestConfig } from "axios";

export class HttpHelper {
  static async Json<T = any>(config: AxiosRequestConfig, retries = 2): Promise<T> {
    return this.WithRetry(async () => {
      const response = await axios.request<T>({
        timeout: 30_000,
        validateStatus: (status) => status >= 200 && status < 500,
        ...config,
      });

      if (response.status >= 400) {
        throw new Error(this.ErrorText(response.data, response.status));
      }

      return response.data;
    }, retries);
  }

  static async Buffer(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 60_000,
    });

    return Buffer.from(response.data);
  }

  static async WithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt === retries) break;
        await this.Delay(750 * (attempt + 1));
      }
    }

    throw lastError;
  }

  static Delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static ErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  static ErrorText(data: unknown, status?: number) {
    const prefix = status ? `HTTP ${status}: ` : "";
    if (typeof data === "string") return `${prefix}${data}`;

    try {
      return `${prefix}${JSON.stringify(data)}`;
    } catch {
      return `${prefix}${String(data)}`;
    }
  }
}
