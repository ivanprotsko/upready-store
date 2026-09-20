export async function GET(req: Request) {
  const category = await retrieve(req)
  // A subscript read is a read.
  const locale = category.metadata["email_locale"] ?? "ru"
  return sendEmail(locale)
}
