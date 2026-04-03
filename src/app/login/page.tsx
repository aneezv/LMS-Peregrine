import { login } from './actions'
import Image from 'next/image'
import { AppCard, AppFieldLabel } from '@/components/ui/primitives'
import LoginSubmitButton from './LoginSubmitButton'

function messageFromSearchParams(sp: { message?: string | string[] } | undefined) {
  const raw = sp?.message
  if (raw == null) return null
  const s = Array.isArray(raw) ? raw[0] : raw
  if (!s) return null
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string | string[] }>
}) {
  const sp = await searchParams
  const loginErrorMessage = messageFromSearchParams(sp)

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center">
      <AppCard className="w-full space-y-8 p-6 sm:p-10">
        <div className="text-center">
          <Image
            src="/logo.png"
            alt="Peregrine T&C Logo"
            width={80}
            height={80}
            className="mx-auto mb-4"
            style={{ width: 'auto', height: 'auto' }}
          />
          <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Sign in to your account</h2>
          <p className="mt-2 text-sm text-slate-600">
            Or contact your administrator if you don&apos;t have an account
          </p>
        </div>
        <form className="mt-8 space-y-6" action={login}>
          {loginErrorMessage ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            >
              {loginErrorMessage}
            </div>
          ) : null}
          <div className="space-y-2">
            <div>
              <AppFieldLabel>Email address</AppFieldLabel>
              <input 
                id="email" 
                name="email" 
                type="email" 
                autoComplete="email" 
                required 
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-slate-300 placeholder-slate-500 text-slate-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" 
                placeholder="Email address" 
              />
            </div>
            <div>
              <AppFieldLabel>Password</AppFieldLabel>
              <input 
                id="password" 
                name="password" 
                type="password" 
                autoComplete="current-password" 
                required 
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-slate-300 placeholder-slate-500 text-slate-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" 
                placeholder="Password" 
              />
            </div>
          </div>

          <div>
            <LoginSubmitButton />
          </div>
        </form>
      </AppCard>
      </div>
    </div>
  )
}
