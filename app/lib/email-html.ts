type PreparedEmailHtml = {
  head: string
  body: string
}

export function prepareEmailHtml(html: string): PreparedEmailHtml {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src")?.trim()
    if (src) {
      img.setAttribute("src", proxiedImageSrc(src))
    }

    const srcset = img.getAttribute("srcset")?.trim()
    if (srcset) {
      img.setAttribute("srcset", proxySrcset(srcset))
    }

    img.setAttribute("referrerpolicy", "no-referrer")
    img.setAttribute("loading", "lazy")
    img.style.maxWidth = "100%"
    if (!img.style.height) {
      img.style.height = "auto"
    }
  })

  return {
    head: doc.head.innerHTML,
    body: doc.body.innerHTML || html,
  }
}

export function emailFrameStyles(isDark: boolean) {
  const scrollbar = isDark ? "rgba(130, 109, 217, 0.35)" : "rgba(130, 109, 217, 0.22)"
  const scrollbarHover = isDark ? "rgba(130, 109, 217, 0.55)" : "rgba(130, 109, 217, 0.4)"

  return `
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
      background: #ffffff;
      color-scheme: light;
    }

    body {
      padding: 20px;
      overflow-wrap: anywhere;
    }

    img {
      max-width: 100%;
      height: auto;
      border: 0;
    }

    a {
      color: #047c78;
    }

    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: ${scrollbar};
      border-radius: 9999px;
      transition: background-color 0.2s;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: ${scrollbarHover};
    }

    * {
      scrollbar-width: thin;
      scrollbar-color: ${scrollbar} transparent;
    }
  `
}

function proxiedImageSrc(src: string) {
  if (!/^https?:\/\//i.test(src)) {
    return src
  }

  return `/api/image-proxy?url=${encodeURIComponent(src)}`
}

function proxySrcset(srcset: string) {
  return srcset
    .split(",")
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/)
      if (!parts[0]) return candidate
      return [proxiedImageSrc(parts[0]), ...parts.slice(1)].join(" ")
    })
    .join(", ")
}
