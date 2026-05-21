"use client"

import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import Link from "next/link"
import { login } from "@/app/login/actions"
import LoginSubmitButton from "@/app/login/LoginSubmitButton"
import { ErrorAlert } from "@/components/ui/error-alert"

interface LoginFormProps extends React.ComponentProps<"div"> {
  errorMessage?: string | null
  redirectTo?: string
  prefillEmail?: string
}

export function LoginForm({
  className,
  errorMessage,
  redirectTo,
  prefillEmail,
  ...props
}: LoginFormProps) {
  const signupHref = redirectTo
    ? `/signup?redirect=${encodeURIComponent(redirectTo)}`
    : '/signup'

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center rounded-md">
            <Image src="/logo.png" alt="Peregrine LMS Logo" width={45} height={45} />
          </div>
          <CardTitle className="text-xl">Sign in to your account</CardTitle>
          <CardDescription>
            Use your email and password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm">
            <span className="text-slate-700">New here?</span>
            <Link
              href={signupHref}
              className="shrink-0 font-semibold text-primary underline-offset-4 hover:underline"
            >
              Create an account &rarr;
            </Link>
          </div>
          <form action={login}>
            <input type="hidden" name="redirect" value={redirectTo ?? ''} />
            <FieldGroup>

              {errorMessage ? <ErrorAlert>{errorMessage}</ErrorAlert> : null}

              <Field>
                <label htmlFor="email">Email</label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="learner@gmail.com"
                  defaultValue={prefillEmail ?? ''}
                  autoFocus={!prefillEmail}
                  required
                />
              </Field>
              <Field>
                <label htmlFor="password">Password</label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoFocus={!!prefillEmail}
                  required
                />
              </Field>
              <Field>
                <LoginSubmitButton />
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
