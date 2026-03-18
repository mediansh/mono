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
          <Link href="/" className="mb-10 inline-block text-foreground">
            <svg width="140" height="28" viewBox="0 0 647 123" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 120.602V37.0028H13.0554L16.6628 51.7354L12.3683 52.2493C15.4603 48.5947 18.7242 45.5111 22.1598 42.9986C25.5954 40.4861 29.2601 38.6017 33.1538 37.3454C37.0475 35.9749 41.113 35.2897 45.3503 35.2897C51.3054 35.2897 56.0007 36.3176 59.4364 38.3733C62.872 40.3148 65.3914 42.9986 66.9947 46.4248C68.598 49.7368 69.6287 53.5056 70.0868 57.7312C70.5449 61.9568 70.7739 66.2967 70.7739 70.7507V120.602H53.5958V67.1532C53.5958 61.2145 52.2215 57.2173 49.473 55.1616C46.8391 53.1059 43.6897 52.078 40.0251 52.078C34.7571 52.078 29.7182 53.734 24.9083 57.046C20.0984 60.2437 16.6055 64.1267 14.4296 68.695V59.1017H17.1781V120.602H0ZM107.192 120.602V67.1532C107.192 61.2145 105.817 57.2173 103.069 55.1616C100.435 53.1059 97.2855 52.078 93.6209 52.078C88.3529 52.078 83.314 53.734 78.5041 57.046C73.6942 60.2437 70.2013 64.1267 68.0254 68.695L65.964 52.2493C69.0561 48.5947 72.32 45.5111 75.7556 42.9986C79.1912 40.4861 82.8559 38.6017 86.7496 37.3454C90.6433 35.9749 94.7088 35.2897 98.9461 35.2897C104.901 35.2897 109.597 36.3176 113.032 38.3733C116.468 40.3148 118.987 42.9986 120.591 46.4248C122.194 49.7368 123.225 53.5056 123.683 57.7312C124.141 61.9568 124.37 66.2967 124.37 70.7507V120.602H107.192Z" fill="currentColor"/>
              <path d="M180.675 122.315C172.544 122.315 165.387 120.545 159.202 117.004C153.018 113.35 148.208 108.267 144.773 101.758C141.337 95.2479 139.619 87.6532 139.619 78.9735C139.619 70.1797 141.337 62.5279 144.773 56.0181C148.208 49.5084 153.018 44.4262 159.202 40.7716C165.387 37.117 172.544 35.2897 180.675 35.2897C188.921 35.2897 196.135 37.117 202.32 40.7716C208.504 44.4262 213.314 49.5084 216.749 56.0181C220.185 62.5279 221.903 70.1797 221.903 78.9735C221.903 79.773 221.845 80.6295 221.731 81.5432C221.731 82.3426 221.674 83.085 221.559 83.7702H155.939V69.0376H209.191L204.381 78.9735C204.381 70.2939 202.434 63.156 198.54 57.5599C194.647 51.9638 188.692 49.1657 180.675 49.1657C173.575 49.1657 167.906 51.4499 163.669 56.0181C159.431 60.4721 157.313 66.3538 157.313 73.6629V82.571C157.313 90.2228 159.374 96.3329 163.497 100.901C167.62 105.355 173.346 107.582 180.675 107.582C187.432 107.582 192.643 106.155 196.307 103.299C199.972 100.444 203.178 96.9039 205.927 92.6783L218.811 100.73C214.917 107.925 209.878 113.35 203.694 117.004C197.624 120.545 189.951 122.315 180.675 122.315Z" fill="currentColor"/>
              <path d="M271.542 122.315C263.869 122.315 257.112 120.487 251.272 116.833C245.431 113.178 240.908 108.096 237.701 101.586C234.495 94.9624 232.891 87.3106 232.891 78.6309C232.891 69.9513 234.495 62.3565 237.701 55.8468C240.908 49.337 245.431 44.312 251.272 40.7716C257.112 37.117 263.869 35.2897 271.542 35.2897C279.1 35.2897 285.685 37.117 291.297 40.7716C296.908 44.312 301.26 49.337 304.352 55.8468C307.559 62.3565 309.162 69.9513 309.162 78.6309C309.162 87.3106 307.559 94.9624 304.352 101.586C301.26 108.096 296.908 113.178 291.297 116.833C285.685 120.487 279.1 122.315 271.542 122.315ZM274.119 107.582C281.219 107.582 286.888 104.955 291.125 99.7019C295.477 94.4485 297.653 87.4819 297.653 78.8022C297.653 70.1226 295.477 63.156 291.125 57.9025C286.888 52.649 281.219 50.0223 274.119 50.0223C267.018 50.0223 261.292 52.649 256.941 57.9025C252.589 63.156 250.413 70.0655 250.413 78.6309C250.413 87.3106 252.589 94.3343 256.941 99.7019C261.292 104.955 267.018 107.582 274.119 107.582ZM300.917 120.602L296.794 103.813H298.512V56.1894H296.794V3.94011H313.972V120.602H300.917Z" fill="currentColor"/>
              <path d="M353.535 120.602H336.357V37.0028H353.535V120.602ZM333.781 11.3064C333.781 7.99443 334.754 5.31058 336.701 3.25487C338.762 1.08496 341.511 0 344.946 0C348.267 0 350.959 1.08496 353.02 3.25487C355.081 5.31058 356.112 7.99443 356.112 11.3064C356.112 14.5042 355.081 17.188 353.02 19.3579C350.959 21.4137 348.267 22.4415 344.946 22.4415C341.511 22.4415 338.762 21.4137 336.701 19.3579C334.754 17.188 333.781 14.5042 333.781 11.3064Z" fill="currentColor"/>
              <path d="M401.211 123C394.684 123 389.072 121.858 384.377 119.574C379.682 117.29 376.074 114.035 373.555 109.809C371.15 105.469 369.947 100.33 369.947 94.3914C369.947 88.9095 371.207 84.0557 373.726 79.8301C376.246 75.4902 379.853 72.0641 384.549 69.5515C389.244 67.039 394.798 65.7827 401.211 65.7827C409.228 65.7827 415.641 67.61 420.451 71.2646C425.375 74.805 428.811 79.7159 430.758 85.9972H421.138V64.5836C421.138 61.0432 419.936 57.7883 417.531 54.8189C415.126 51.8496 410.889 50.3649 404.819 50.3649C401.612 50.3649 398.062 50.7646 394.168 51.5641C390.389 52.2493 386.438 53.5056 382.316 55.3329L377.162 42.1421C381.857 39.8579 386.725 38.1448 391.764 37.0028C396.802 35.8607 401.727 35.2897 406.537 35.2897C413.752 35.2897 419.707 36.6031 424.402 39.2298C429.097 41.8565 432.59 45.3969 434.881 49.851C437.171 54.1908 438.316 59.1017 438.316 64.5836V120.602H425.948L421.653 105.355L430.758 102.786C428.697 109.524 425.032 114.606 419.764 118.032C414.496 121.344 408.312 123 401.211 123ZM404.304 107.753C409.342 107.753 413.408 106.611 416.5 104.327C419.592 101.929 421.138 98.617 421.138 94.3914C421.138 90.0515 419.592 86.7395 416.5 84.4554C413.408 82.1713 409.342 81.0292 404.304 81.0292C399.265 81.0292 395.199 82.1713 392.107 84.4554C389.015 86.7395 387.469 90.0515 387.469 94.3914C387.469 98.617 389.015 101.929 392.107 104.327C395.199 106.611 399.265 107.753 404.304 107.753Z" fill="currentColor"/>
              <path d="M507.576 35.2897C513.531 35.2897 518.227 36.3176 521.662 38.3733C525.098 40.3148 527.618 42.9986 529.221 46.4248C530.824 49.7368 531.855 53.5056 532.313 57.7312C532.771 61.9568 533 66.2967 533 70.7507V120.602H515.822V67.1532C515.822 61.2145 514.448 57.2173 511.699 55.1616C509.065 53.1059 505.916 52.078 502.251 52.078C498.586 52.078 494.865 52.8203 491.085 54.305C487.306 55.7897 483.928 57.7883 480.95 60.3008C477.973 62.8134 475.682 65.6114 474.079 68.695V59.1017H476.828V120.602H459.649V37.0028H472.705L476.312 51.7354L472.018 52.2493C475.224 48.5947 478.717 45.5111 482.496 42.9986C486.275 40.4861 490.284 38.6017 494.521 37.3454C498.758 35.9749 503.11 35.2897 507.576 35.2897Z" fill="currentColor"/>
              <path d="M575.053 39.2787C577.086 37.1794 579.847 36 582.722 36C595.656 36 607.845 36 619.848 36C643.99 36.0001 656.08 66.1439 639.009 83.7734L601.823 122.175C600.116 123.938 597.197 122.689 597.197 120.196V86.3733L601.495 81.9353C604.909 78.4095 602.491 72.3806 597.662 72.3806H543L575.053 39.2787Z" fill="currentColor"/>
            </svg>
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
                  className="mt-1 h-10 rounded-lg bg-[#0496FF] text-sm font-medium text-white transition-colors hover:bg-[#0496FF]/90 disabled:opacity-50"
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
                  className="mt-1 h-10 rounded-lg bg-[#0496FF] text-sm font-medium text-white transition-colors hover:bg-[#0496FF]/90 disabled:opacity-50"
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
      <div className="hidden flex-col items-center justify-center bg-[#0496FF] lg:flex lg:w-1/2">
        <Image
          src="/median.svg"
          alt="Median"
          width={157}
          height={131}
          className="size-40 brightness-0 invert"
          priority
        />
      </div>
    </div>
  )
}
