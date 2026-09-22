/** Match the browser accept hint and the authoritative server policy with identical semantics. */
export function inputUploadAccepts(accept: string, name: string, contentType: string): boolean {
  const mime = contentType.toLowerCase()
  return accept.split(',').some((part) => {
    const item = part.trim().toLowerCase()
    if (item.startsWith('.')) return name.toLowerCase().endsWith(item)
    if (item.endsWith('/*')) return mime.startsWith(item.slice(0, -1))
    return mime === item
  })
}
