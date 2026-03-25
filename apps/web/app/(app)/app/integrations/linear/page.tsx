"use client"

export default function LinearIntegrationPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-10 py-10">
      <div
        className="flex flex-col gap-6"
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Linear</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sync tasks between Median and Linear for seamless project tracking.
          </p>
        </div>

        <div className="rounded-none border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-10 items-center justify-center rounded-none bg-[#5E6AD2]/10">
              <svg width={20} height={20} viewBox="0 0 100 100" fill="none">
                <path fill="#5E6AD2" d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">Not connected</h3>
              <p className="text-xs text-muted-foreground">
                Link your Linear workspace to sync issues.
              </p>
            </div>
            <button className="rounded-none bg-[#5E6AD2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5E6AD2]/90">
              Connect
            </button>
          </div>
        </div>

        <div className="rounded-none border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Once connected, you can import Linear issues and keep statuses in sync across both platforms.
          </p>
        </div>
      </div>
    </div>
  )
}
