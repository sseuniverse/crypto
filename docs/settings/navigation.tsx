import { PageRoutes } from "@/lib/pageroutes"
import { companylink } from "./settings"

export const Navigations = [
  {
    title: "Docs",
    href: `/docs${PageRoutes[0].href}`,
  },
  {
    title: "Home",
    href: companylink,
    external: true,
  },
]

export const GitHubLink = {
  href: "https://github.com/sseuniverse/crypto",
}
