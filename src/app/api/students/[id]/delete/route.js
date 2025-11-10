import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { Redis } from "@upstash/redis";


const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function DELETE(req, { params }) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  
  const token = req.cookies.get("token")?.value;
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  
  let client;
  try {
    client = await clientPromise;
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to connect to database" },
      { status: 500 }
    );
  }

  const db = client.db(process.env.MONGODB_DB);
  const collection = db.collection("students");


  let objId;
  try {
    objId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }


  const result = await collection.deleteOne({
    _id: objId,
    createdBy: new ObjectId(decoded.userId),
  });

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }


  const cacheKey = `students:${decoded.userId}`;
  await redis.del(cacheKey);

  return NextResponse.json({ message: "Student deleted successfully" });
}
