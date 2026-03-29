import { Axiom } from "@axiomhq/js"

const token = process.env.AXIOM_TOKEN

if (!token && process.env.NODE_ENV === "production") {
  console.warn("[median] AXIOM_TOKEN is not set — logs will not be sent to Axiom")
}

const axiomClient = new Axiom({
  token: token ?? "",
})

export default axiomClient
