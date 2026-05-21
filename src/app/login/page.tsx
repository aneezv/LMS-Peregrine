import { Info } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { Alert, AlertDescription } from "@/components/ui/alert"

/**
 * Notice codes that the rest of the app can append to `/login?notice=…` URLs to
 * surface a friendly inline reason for the redirect. Rendered server-side so
 * the message is visible on first paint — no toast hydration race.
 */
const NOTICE_MESSAGES: Record<string, string> = {
  auth_required: 'Please sign in to continue to checkout.',
  enroll_required: 'Please sign in to enroll in this course.',
  email_exists: 'An account with this email already exists. Sign in below to continue.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    message?: string | string[]
    redirect?: string | string[]
    notice?: string | string[]
    email?: string | string[]
  }>
}) {
  const sp = await searchParams

  const raw = sp?.message
  const message = raw == null ? null : (() => {
    const s = Array.isArray(raw) ? raw[0] : raw
    if (!s) return null
    try { return decodeURIComponent(s) } catch { return s }
  })()

  const rawRedirect = sp?.redirect
  const redirectTo = (() => {
    const s = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect
    if (!s) return ''
    try { return decodeURIComponent(s) } catch { return s }
  })()

  const rawNotice = sp?.notice
  const noticeKey = Array.isArray(rawNotice) ? rawNotice[0] ?? null : rawNotice ?? null
  const noticeText = noticeKey ? NOTICE_MESSAGES[noticeKey] ?? null : null

  const rawEmail = sp?.email
  const prefillEmail = (() => {
    const s = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail
    if (!s) return ''
    try { return decodeURIComponent(s) } catch { return s }
  })()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-4">
        {noticeText ? (
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>{noticeText}</AlertDescription>
          </Alert>
        ) : null}
        <LoginForm errorMessage={message} redirectTo={redirectTo} prefillEmail={prefillEmail} />
      </div>
    </div>
  )
}
