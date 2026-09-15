// Decodes an ACE ("xn--…") hostname back to its Unicode form, so the panel
// can show a shop owner the domain they actually typed (черкашино.рф)
// instead of the wire form her DNS provider and our backend store it as
// (xn--80ajkgrgj8cn.xn--p1ai). No `URL`/`Intl` browser API does this
// decoding direction, so this is a minimal Punycode decoder (RFC 3492,
// bootstring algorithm), applied per label.

const BASE = 36
const T_MIN = 1
const T_MAX = 26
const SKEW = 38
const DAMP = 700
const INITIAL_BIAS = 72
const INITIAL_N = 128
const DELIMITER = "-"

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let k = 0
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / numPoints)

  for (; delta > ((BASE - T_MIN) * T_MAX) >> 1; k += BASE) {
    delta = Math.floor(delta / (BASE - T_MIN))
  }

  return Math.floor(k + ((BASE - T_MIN + 1) * delta) / (delta + SKEW))
}

function decodePunycodeLabel(input: string): string {
  const output: number[] = []
  let n = INITIAL_N
  let i = 0
  let bias = INITIAL_BIAS

  const lastDelimiter = input.lastIndexOf(DELIMITER)
  const basic = lastDelimiter > 0 ? input.slice(0, lastDelimiter) : ""
  for (const ch of basic) {
    output.push(ch.codePointAt(0) as number)
  }

  let index = lastDelimiter > 0 ? lastDelimiter + 1 : 0

  while (index < input.length) {
    const oldi = i
    let w = 1

    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) {
        throw new RangeError("Invalid punycode input")
      }

      const code = input.charCodeAt(index++)
      const digit =
        code - 48 < 10
          ? code - 22
          : code - 65 < 26
            ? code - 65
            : code - 97 < 26
              ? code - 97
              : BASE

      if (digit >= BASE) {
        throw new RangeError("Invalid punycode digit")
      }

      i += digit * w
      const t =
        k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias

      if (digit < t) {
        break
      }

      w *= BASE - t
    }

    bias = adapt(i - oldi, output.length + 1, oldi === 0)
    n += Math.floor(i / (output.length + 1))
    i %= output.length + 1
    output.splice(i, 0, n)
    i++
  }

  return String.fromCodePoint(...output)
}

/** Decodes one label ("xn--80ajkgrgj8cn" -> "черкашино"), or returns it unchanged. */
export function decodeAceLabel(label: string): string {
  if (!label.toLowerCase().startsWith("xn--")) {
    return label
  }

  try {
    return decodePunycodeLabel(label.slice(4))
  } catch {
    return label
  }
}

/** Decodes a full ACE hostname ("xn--80ajkgrgj8cn.xn--p1ai" -> "черкашино.рф"). */
export function domainToUnicode(host: string): string {
  return host
    .split(".")
    .map((label) => decodeAceLabel(label))
    .join(".")
}

/** True when the hostname carries at least one ACE ("xn--") label. */
export function isAceHostname(host: string): boolean {
  return host.split(".").some((label) => label.toLowerCase().startsWith("xn--"))
}
