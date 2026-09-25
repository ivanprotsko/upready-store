import { Fragment } from "react"

/**
 * A page text of the pricing document: `**bold**` becomes `<b>` and a line
 * break `\n` becomes `<br>`, nothing else. No HTML is ever interpreted, so an
 * admin text cannot inject markup. The backend refuses unbalanced `**`.
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) => {
        const lines = part.split("\n").map((line, j) => (
          <Fragment key={j}>
            {j > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))
        return i % 2 === 1 ? <b key={i}>{lines}</b> : <Fragment key={i}>{lines}</Fragment>
      })}
    </>
  )
}
