export async function GET() {
  return listCollections({ fields: "id,handle,metadata" })
}
