"use client"

import { useSignUp } from "@clerk/nextjs/legacy"
import Link from "next/link"
import { useState } from "react"
import { motion } from "motion/react"
import { Logo } from "@/components/logo"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

type Stage = "initial" | "verify"

export default function SignUpPage() {
  const { signUp, setActive, isLoaded } = useSignUp()
  const { navigate } = useInstantNavigation()

  const [stage, setStage] = useState<Stage>("initial")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [ssoLoading, setSsoLoading] = useState<string | null>(null)

  if (!isLoaded) return null

  const handleOAuth = (strategy: "oauth_github" | "oauth_google") => {
    setSsoLoading(strategy)
    signUp.authenticateWithRedirect({
      strategy,
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/app",
    })
  }

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await signUp.create({ emailAddress: email, password, firstName, lastName })
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
      setStage("verify")
    } catch (err: any) {
      setError(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Sign up failed")
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await signUp.attemptEmailAddressVerification({ code })
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        navigate("/app")
      } else {
        setError("Verification incomplete. Please try again.")
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Verification failed")
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "h-9 rounded-[8px] bg-background px-3 text-[14px] ring-1 ring-border outline-none transition-all placeholder:text-muted-foreground focus:ring-foreground/30"

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[340px]"
      >
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo symbolOnly className="size-9" />
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-[8px] gradient-border gradient-border-to-tl gradient-border-from-neutral-700 gradient-border-via-neutral-800 gradient-border-to-neutral-600 bg-card p-5 ring-1 ring-border">
          {stage === "initial" && (
            <>
              <h1 className="text-center text-[16px] font-semibold">Create your account</h1>
              <p className="mt-1 text-center text-[14px] text-muted-foreground">
                Get started with Median
              </p>

              {/* OAuth */}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  disabled={!!ssoLoading}
                  onClick={() => handleOAuth("oauth_github")}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[8px] bg-background text-[14px] font-medium ring-1 ring-border transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {ssoLoading === "oauth_github" ? <Spinner /> : (
                    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  disabled={!!ssoLoading}
                  onClick={() => handleOAuth("oauth_google")}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[8px] bg-background text-[14px] font-medium ring-1 ring-border transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {ssoLoading === "oauth_google" ? <Spinner /> : (
                    <svg className="size-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-2 text-[12px] text-muted-foreground">or continue with email</span>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleEmailSignUp} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="first-name" className="text-[14px] font-medium">First name</label>
                    <input id="first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" className={inputClass} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="last-name" className="text-[14px] font-medium">Last name</label>
                    <input id="last-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className={inputClass} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="email" className="text-[14px] font-medium">Email</label>
                  <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={inputClass} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="password" className="text-[14px] font-medium">Password</label>
                  <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" required className={inputClass} />
                </div>

                <div id="clerk-captcha" />
                {error && <p className="text-[13px] text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 flex h-9 items-center justify-center rounded-[8px] bg-primary text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? <Spinner /> : "Create account"}
                </button>
              </form>
            </>
          )}

          {stage === "verify" && (
            <>
              <h1 className="text-center text-[16px] font-semibold">Verify your email</h1>
              <p className="mt-1 text-center text-[14px] text-muted-foreground">
                Code sent to <span className="font-medium text-foreground">{email}</span>
              </p>
              <form onSubmit={handleVerify} className="mt-5 flex flex-col gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code"
                  required
                  className="h-9 rounded-[8px] bg-background px-3 text-center text-[14px] tracking-widest ring-1 ring-border outline-none transition-all placeholder:text-muted-foreground placeholder:tracking-normal focus:ring-foreground/30"
                />
                {error && <p className="text-[13px] text-destructive">{error}</p>}
                <button type="submit" disabled={loading} className="flex h-9 items-center justify-center rounded-[8px] bg-primary text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                  {loading ? <Spinner /> : "Verify email"}
                </button>
              </form>
              <button type="button" onClick={() => { setStage("initial"); setError("") }} className="mt-3 w-full text-center text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                Back to sign up
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-[14px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
        </p>
      </motion.div>
    </div>
  )
}
