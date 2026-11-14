import { getNearPrice } from "@/lib/price";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getNearPrice());
}
