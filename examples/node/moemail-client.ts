type MoeMailClientOptions = {
  baseUrl: string
  apiKey: string
}

type CreateInboxesInput = {
  count?: number
  domain: string
  prefix?: string
  mode?: "human" | "prefix" | "random"
  batch_name?: string
  tags?: string[]
}

type MoeMailEnvelope<T = unknown> = {
  success: boolean
  data?: T
  error?: {
    message?: string
  }
}

export class MoeMailClient {
  private baseUrl: string
  private apiKey: string

  constructor(options: MoeMailClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.apiKey = options.apiKey
  }

  async createInboxes(input: CreateInboxesInput) {
    return this.request("/api/v1/otp/create", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  async listInboxes(params: Record<string, string | number | boolean> = {}) {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      search.set(key, String(value))
    }
    return this.request(`/api/v1/otp/emails?${search}`)
  }

  async latest(email: string) {
    return this.request(`/api/v1/otp/latest?email=${encodeURIComponent(email)}`)
  }

  async wait(email: string, options: { timeout?: number; interval?: number } = {}) {
    const search = new URLSearchParams({
      email,
      timeout: String(options.timeout || 60),
      interval: String(options.interval || 3),
    })
    return this.request(`/api/v1/otp/wait?${search}`)
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
        ...(init.headers || {}),
      },
    })
    const payload = await response.json() as MoeMailEnvelope
    if (!response.ok || !payload.success) {
      throw new Error(payload.error?.message || `MoeMail API failed with ${response.status}`)
    }
    return payload.data
  }
}
