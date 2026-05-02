export const parseDomainList = (value?: string | null): string[] => {
  const domains = String(value || "")
    .split(/[\r\n,，;；]+/)
    .map(item => item.trim().toLowerCase().replace(/^\*\./, "").replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
  return Array.from(new Set(domains))
}

export const resolveActiveEmailDomains = (allValue?: string | null, activeValue?: string | null): string[] => {
  const allDomains = parseDomainList(allValue || "moemail.app")
  const activeDomains = parseDomainList(activeValue || "")
  if (!activeDomains.length) return allDomains
  const allSet = new Set(allDomains)
  return activeDomains.filter(domain => allSet.has(domain))
}
