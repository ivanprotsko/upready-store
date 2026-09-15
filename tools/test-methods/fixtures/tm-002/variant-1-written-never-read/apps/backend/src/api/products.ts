export async function GET() {
  // metadata travels through untouched; nothing here reads a key out of it.
  return listProducts({ fields: "id,title,metadata" })
}
