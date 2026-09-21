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
import { GoogleSignInButton } from "@/components/google-signin-button"
import { Separator } from "@/components/ui/separator"

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
          <GoogleSignInButton nextUrl={redirectTo} className="mb-6" />

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>
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
          <div className="mt-4 text-center text-sm">
            New here?{" "}
            <Link href={signupHref} className="underline underline-offset-4">
              Create an account
            </Link>
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
