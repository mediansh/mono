"use client"

import { useSignUp } from "@clerk/nextjs/legacy"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

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
  const router = useRouter()

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
      await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName,
      })

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      })

      setStage("verify")
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Sign up failed"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      })

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        router.push("/app")
      } else {
        setError("Verification incomplete. Please try again.")
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Verification failed"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh">
      {/* Left half - Form */}
      <div className="flex w-full flex-col justify-center px-8 py-12 sm:px-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          {/* Logo */}
          <Link href="/" className="mb-10 inline-block">
            <Image
              src="/median-full.png"
              alt="Median"
              width={260}
              height={200}
              className="h-7 w-auto dark:invert"
            />
          </Link>

          {stage === "initial" && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Get started with Median today
              </p>

              {/* OAuth buttons */}
              <div className="mt-8 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={!!ssoLoading}
                  onClick={() => handleOAuth("oauth_github")}
                  className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-border bg-card text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {ssoLoading === "oauth_github" ? <Spinner /> : (
                    <>
                      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      Continue with GitHub
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!!ssoLoading}
                  onClick={() => handleOAuth("oauth_google")}
                  className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-border bg-card text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {ssoLoading === "oauth_google" ? <Spinner /> : (
                    <>
                      <svg className="size-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>

              {/* Email/password form */}
              <form onSubmit={handleEmailSignUp} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="first-name" className="text-sm font-medium">
                      First name
                    </label>
                    <input
                      id="first-name"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="last-name" className="text-sm font-medium">
                      Last name
                    </label>
                    <input
                      id="last-name"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    required
                    className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div id="clerk-captcha" />

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 h-10 rounded-lg bg-[#14120B] text-sm font-medium text-white transition-colors hover:bg-[#14120B]/90 disabled:opacity-50"
                >
                  {loading ? <Spinner /> : "Create account"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}

          {stage === "verify" && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                We sent a verification code to{" "}
                <span className="font-medium text-foreground">{email}</span>
              </p>

              <form onSubmit={handleVerify} className="mt-8 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="code" className="text-sm font-medium">
                    Verification code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    required
                    className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 h-10 rounded-lg bg-[#14120B] text-sm font-medium text-white transition-colors hover:bg-[#14120B]/90 disabled:opacity-50"
                >
                  {loading ? <Spinner /> : "Verify email"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => { setStage("initial"); setError("") }}
                className="mt-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Back to sign up
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right half - Branding */}
      <div className="hidden flex-col items-center justify-center bg-[#14120B] lg:flex lg:w-1/2">
        <Image
          src="/median-full.png"
          alt="Median"
          width={260}
          height={200}
          className="w-48 invert"
          priority
        />
      </div>
    </div>
  )
}
