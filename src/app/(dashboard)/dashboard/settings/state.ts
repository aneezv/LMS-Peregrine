export type SettingsState = {
  ok: boolean | null
  error: string | null
  /** 'validation' → show inline in the modal; 'server' → surface as a toast. */
  kind?: 'validation' | 'server'
}

export const initialSettingsState: SettingsState = { ok: null, error: null }
