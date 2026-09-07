/**
 * The inline `<head>` script that applies the visitor's stored choice to `<html>`
 * BEFORE the first paint. Without it the page paints the profile's default, then
 * repaints the stored theme after hydration — the flash Ivan asked not to see.
 *
 * Three properties this script must have, in order of how badly they bite:
 *
 *   1. it must NEVER throw. `localStorage` is not a safe read: Safari in private mode
 *      and any browser with site data blocked throw on ACCESS, not on the getter, so
 *      the whole body sits inside one try/catch. A theme preference is not worth a
 *      blank page.
 *   2. it must be idempotent. It only ever writes an attribute that SSR already wrote,
 *      and only with a value from the allow-list, so running it twice (or after React
 *      has hydrated) changes nothing.
 *   3. it must accept nothing but allow-listed values. localStorage is attacker-writable
 *      in the same origin; `setAttribute("data-theme", <anything>)` would otherwise put
 *      arbitrary text into the DOM.
 *
 * The script is GENERATED from `AXES`, so a new axis is allow-listed by adding it to
 * that array — there is no second list here to keep in sync.
 */

import { AXES } from "./attributes"

export function themePrePaintScript(): string {
  const table = AXES.map((a) => [a.storageKey, a.attr, a.allowed] as const)
  return (
    `(function(){try{var d=document.documentElement,t=${JSON.stringify(table)};` +
    `for(var i=0;i<t.length;i++){var v=null;try{v=localStorage.getItem(t[i][0])}catch(e){}` +
    `if(v&&t[i][2].indexOf(v)>=0){d.setAttribute(t[i][1],v)}}}catch(e){}})();`
  )
}
