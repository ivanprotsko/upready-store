export async function GET() {
  return listPages({ fields: "id,handle,metadata" })
}
