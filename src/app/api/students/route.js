
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { Redis } from "@upstash/redis"; // Install with: npm install @upstash/redis

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = decoded.userId || decoded._id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cacheKey = `students:${userId}`;

    // Try fetching from Redis cache
    const cachedStudents = await redis.get(cacheKey);
    if (cachedStudents) {
      console.log("HIT")
      return new Response(JSON.stringify(cachedStudents), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }

    // If not cached, fetch from MongoDB
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB);
    const students = await db
      .collection("students")
      .find({ createdBy: new ObjectId(userId) })
      .toArray();

    // Cache the result in Redis for 1 day (86400 seconds)
    await redis.set(cacheKey, students, { ex: 86400 });
    console.log("store")
    return new Response(JSON.stringify(students), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Cannot fetch students" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
