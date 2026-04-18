import { useEffect } from "react"
import { SignIn, useAuth } from "@clerk/clerk-react"
import { useNavigate } from "react-router"
import { motion } from "motion/react"
import { ShieldCheck } from "@phosphor-icons/react"

import { fadeUp } from "~/lib/utils"

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate("/", { replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <motion.div
        variants={fadeUp}
        className="flex w-full max-w-sm flex-col items-center gap-6"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center border border-sidebar-border bg-sidebar ring-1 ring-sidebar-border">
            <ShieldCheck size={18} weight="fill" />
          </div>
          <h1 className="text-[15px] font-semibold">Admin sign in</h1>
          <p className="text-[12px] text-muted-foreground">
            Admin access is restricted. Sign in with your Median account.
          </p>
        </div>

        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-in"
          fallbackRedirectUrl="/"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "!shadow-none !border !border-sidebar-border !bg-sidebar !rounded-none",
              formButtonPrimary:
                "!rounded-none !bg-foreground !text-background hover:!bg-foreground/90",
              socialButtonsBlockButton: "!rounded-none",
              formFieldInput: "!rounded-none",
            },
          }}
        />
      </motion.div>
    </motion.div>
  )
}
