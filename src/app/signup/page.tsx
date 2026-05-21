import Link from 'next/link'
import Image from 'next/image'
import { ErrorAlert } from '@/components/ui/error-alert'
import { signup } from './actions'
import SignupSubmitButton from './SignupSubmitButton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string | string[]; redirect?: string | string[] }>
}) {
  const sp = await searchParams

  const rawMessage = sp?.message
  const message = rawMessage == null ? null : (() => {
    const s = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage
    if (!s) return null
    try { return decodeURIComponent(s) } catch { return s }
  })()

  const rawRedirect = sp?.redirect
  const redirectTo = (() => {
    const s = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect
    if (!s) return ''
    try { return decodeURIComponent(s) } catch { return s }
  })()

  const loginHref = redirectTo
    ? `/login?redirect=${encodeURIComponent(redirectTo)}`
    : '/login'

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <div className="flex items-center justify-center rounded-md">
                <Image src="/logo.png" alt="Peregrine LMS Logo" width={45} height={45} />
              </div>
              <CardTitle className="text-xl">Create a new account</CardTitle>
              <CardDescription>
                Sign up to enroll in courses and start learning.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-700">Already have an account?</span>
                <Link
                  href={loginHref}
                  className="shrink-0 font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Sign in &rarr;
                </Link>
              </div>
              <form action={signup}>
                <input type="hidden" name="redirect" value={redirectTo} />
                <FieldGroup>
                  {message ? <ErrorAlert>{message}</ErrorAlert> : null}

                  <Field>
                    <label htmlFor="full_name">Full Name</label>
                    <Input
                      id="full_name"
                      name="full_name"
                      type="text"
                      placeholder="John Doe"
                      required
                    />
                  </Field>
                  <Field>
                    <label htmlFor="email">Email</label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="learner@gmail.com"
                      required
                    />
                  </Field>
                  <Field>
                    <label htmlFor="password">Password</label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      minLength={6}
                      required
                    />
                  </Field>
                  <Field>
                    <label htmlFor="confirm_password">Re-enter Password</label>
                    <Input
                      id="confirm_password"
                      name="confirm_password"
                      type="password"
                      minLength={6}
                      required
                    />
                  </Field>
                  <Field>
                    <SignupSubmitButton />
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
          <FieldDescription className="px-6 text-center">
            By clicking continue, you agree to our <a href="#">Terms of Service</a>{' '}
            and <a href="#">Privacy Policy</a>.
          </FieldDescription>
        </div>
      </div>
    </div>
  )
}
