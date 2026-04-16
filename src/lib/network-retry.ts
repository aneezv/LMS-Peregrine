type RetryOptions = {
  retries?: number
  baseDelayMs?: number
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network error')
}

export async function retryAsync<T>(
  run: () => Promise<T>,
  options: RetryOptions = {},
  shouldRetry: (error: unknown) => boolean = isTransientFetchError,
): Promise<T> {
  const retries = options.retries ?? 2
  const baseDelayMs = options.baseDelayMs ?? 350
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (!shouldRetry(error) || attempt >= retries) {
        throw error
      }
      await wait(baseDelayMs * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry operation failed')
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 2
  const baseDelayMs = options.baseDelayMs ?? 350
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init)
      if (res.status >= 500 && attempt < retries) {
        await wait(baseDelayMs * (attempt + 1))
        continue
      }
      return res
    } catch (error) {
      lastError = error
      if (!isTransientFetchError(error) || attempt >= retries) {
        throw error
      }
      await wait(baseDelayMs * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed')
}

