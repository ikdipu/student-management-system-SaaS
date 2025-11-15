import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

export async function GET(req, { params }) {
  const { id } = await params;

  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  let objId;
  try {
    objId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Removed Redis logic here

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB);
  const collection = db.collection("students");

  const student = await collection.findOne({ _id: objId });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Removed Redis set here

  return NextResponse.json(student);
}
