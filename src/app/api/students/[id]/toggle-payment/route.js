import { MongoClient, ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { Redis } from "@upstash/redis";


const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function PATCH(req, { params }) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return new Response(JSON.stringify({ error: "Invalid ID" }), { status: 400 });
  }


  const token = req.cookies.get("token")?.value;
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }


  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  try {
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB);
    const collection = db.collection("students");


    const student = await collection.findOne({
      _id: new ObjectId(id),
      createdBy: new ObjectId(decoded.userId),
    });

    if (!student) {
      return new Response(JSON.stringify({ error: "Student not found" }), { status: 404 });
    }


    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);
    const paymentDate = `${day}-${month}-${year}`;

    let updatedPaidMonths = student.paid_months || [];
    let updatedDueMonths = student.due_months || [];
    let newPaymentStatus = !student.payment_status;

    if (newPaymentStatus) {
      // Unpaid → Paid
      if (!updatedPaidMonths.includes(paymentDate)) {
        updatedPaidMonths.push(paymentDate);
      }
      updatedDueMonths = updatedDueMonths.filter((m) => m !== paymentDate);
      console.log(`✅ Payment received for ${student.name} on ${paymentDate}`);
    }

    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          payment_status: newPaymentStatus,
          paid_months: updatedPaidMonths,
          due_months: updatedDueMonths,
        },
      }
    );

    const updatedStudent = await collection.findOne({ _id: new ObjectId(id) });

    
    const cacheKey = `students:${decoded.userId}`;
    await redis.del(cacheKey);

    return new Response(JSON.stringify(updatedStudent), { status: 200 });
  } catch (err) {
    console.error("PATCH error:", err);
    return new Response(JSON.stringify({ error: "Failed to update student" }), { status: 500 });
  }
}
