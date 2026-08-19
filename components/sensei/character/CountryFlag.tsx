interface CountryFlagProps {
  readonly flag: string
  readonly className?: string
}

type CountryCode = "BR" | "PL" | "US" | "AU" | "KR" | "JP"

const COUNTRY_BY_FLAG: Readonly<Record<string, CountryCode>> = {
  "\ud83c\udde7\ud83c\uddf7": "BR",
  Brazil: "BR",
  "\ud83c\uddf5\ud83c\uddf1": "PL",
  Poland: "PL",
  "\ud83c\uddfa\ud83c\uddf8": "US",
  USA: "US",
  "United States": "US",
  "\ud83c\udde6\ud83c\uddfa": "AU",
  Australia: "AU",
  "\ud83c\uddf0\ud83c\uddf7": "KR",
  Korea: "KR",
  "South Korea": "KR",
  "\ud83c\uddef\ud83c\uddf5": "JP",
  Japan: "JP",
}

const COUNTRY_LABELS: Readonly<Record<CountryCode, string>> = {
  BR: "Brazil",
  PL: "Poland",
  US: "United States",
  AU: "Australia",
  KR: "South Korea",
  JP: "Japan",
}

function FlagArtwork({ code }: { readonly code: CountryCode }) {
  switch (code) {
    case "BR":
      return (
        <>
          <rect width="24" height="16" fill="#229e45" />
          <path d="M12 2 21 8l-9 6-9-6 9-6Z" fill="#f7df31" />
          <circle cx="12" cy="8" r="3.1" fill="#2556a7" />
          <path d="M9.1 7.4c2.2-.7 4.2-.3 5.8.8" fill="none" stroke="#fff" strokeWidth=".55" />
        </>
      )
    case "PL":
      return (
        <>
          <rect width="24" height="8" fill="#fff" />
          <rect y="8" width="24" height="8" fill="#dc143c" />
        </>
      )
    case "US":
      return (
        <>
          <rect width="24" height="16" fill="#fff" />
          {[0, 4, 8, 12].map((y) => (
            <rect key={y} y={y} width="24" height="2" fill="#b22234" />
          ))}
          <rect width="10" height="8.5" fill="#3c3b6e" />
          {[2, 5, 8].flatMap((x) => [2, 4.25, 6.5].map((y) => (
            <circle key={`${x}:${y}`} cx={x} cy={y} r=".45" fill="#fff" />
          )))}
        </>
      )
    case "AU":
      return (
        <>
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0 10 7M10 0 0 7" stroke="#fff" strokeWidth="2" />
          <path d="M0 0 10 7M10 0 0 7" stroke="#c8102e" strokeWidth=".8" />
          <path d="M5 0v7M0 3.5h10" stroke="#fff" strokeWidth="2.5" />
          <path d="M5 0v7M0 3.5h10" stroke="#c8102e" strokeWidth="1.2" />
          {[{ x: 16, y: 4 }, { x: 20, y: 8 }, { x: 15, y: 12 }, { x: 11, y: 9 }].map((star) => (
            <circle key={`${star.x}:${star.y}`} cx={star.x} cy={star.y} r=".9" fill="#fff" />
          ))}
        </>
      )
    case "KR":
      return (
        <>
          <rect width="24" height="16" fill="#fff" />
          <path d="M12 4a4 4 0 0 1 0 8 2 2 0 0 0 0-4 2 2 0 0 1 0-4Z" fill="#cd2e3a" />
          <path d="M12 12a4 4 0 0 1 0-8 2 2 0 0 0 0 4 2 2 0 0 1 0 4Z" fill="#0047a0" />
          <path d="m3 3 3 2M18 11l3 2M18 5l3-2M3 13l3-2" stroke="#111" strokeWidth=".8" />
        </>
      )
    case "JP":
      return (
        <>
          <rect width="24" height="16" fill="#fff" />
          <circle cx="12" cy="8" r="4.1" fill="#bc002d" />
        </>
      )
  }
}

export function CountryFlag({ flag, className }: CountryFlagProps) {
  const code = COUNTRY_BY_FLAG[flag]
  if (!code) return <span className={className}>{flag}</span>

  return (
    <svg
      viewBox="0 0 24 16"
      role="img"
      aria-label={`${COUNTRY_LABELS[code]} flag`}
      data-testid="athlete-flag"
      className={className}
    >
      <FlagArtwork code={code} />
    </svg>
  )
}
