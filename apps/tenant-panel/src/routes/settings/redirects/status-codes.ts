// b10-panel-gaps: what `PostTenantRedirectSchema` accepts, in the order the
// screen offers them. 301 first because it is what a shop that moved actually
// needs: it is the only one search engines carry the old address's weight over.
export const REDIRECT_STATUS_CODES = [301, 302, 307, 308] as const
