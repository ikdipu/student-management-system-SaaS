import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) return Response.json({ loggedIn: false });

    // Decode token safely
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return Response.json({ loggedIn: false });
    }

    const userId = decoded.userId;
    if (!userId) return Response.json({ loggedIn: false });

    // check chache first
    const cachedUser = await redis.get(`user:${userId}`);
    if (cachedUser) {
      return Response.json({
        loggedIn: true,
        user: cachedUser,
        cached: true, // optional for debugging
      });
    }


    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB);
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

    if (!user) return Response.json({ loggedIn: false });

    const userData = { id: user._id, name: user.name, email: user.email, plan: user.plan };


    await redis.set(`user:${userId}`, userData, { ex: 86400 });

    return Response.json({ loggedIn: true, user: userData });
  } catch (err) {
    console.error("Error verifying token:", err);
    return Response.json({ loggedIn: false });
  }
}
