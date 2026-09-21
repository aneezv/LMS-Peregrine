import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data?.user) {
      // Robustly ensure the profile exists for OAuth users
      const admin = createAdminClient()
      if (admin) {
        const meta = data.user.user_metadata || {}
        // Google provides name, full_name, etc.
        const fullName = meta.full_name || meta.name || data.user.email?.split('@')[0] || 'User'
        
        await admin.from('profiles').upsert(
          { 
            id: data.user.id, 
            full_name: fullName, 
            email: data.user.email,
            role: 'learner'
          },
          { onConflict: 'id' }
        )
      }

      const forwardedHost = request.headers.get('x-forwarded-host') 
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent('Could not login with provider')}`)
}
