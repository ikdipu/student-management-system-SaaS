import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

function MarksTemplate(name, total, subject, obtainedMarks) {
  return `Dear ${name},  
Your ${subject} exam results have been published.  
Total Marks: ${total} 
Obtained Marks: ${obtainedMarks} \n`;
}

function formatPhoneNumber(phone) {
  phone = phone.replace(/\s+/g, "").replace(/-/g, "");
  if (phone.startsWith("+880")) return phone.slice(1);
  if (phone.startsWith("0")) return "88" + phone;
  if (phone.startsWith("880")) return phone;
  throw new Error("Invalid phone number format");
}

export async function POST(req) {
  let students;
  try {
    students = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Cannot parse JSON" }, { status: 400 });
  }

  const token = req.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB);
    const collection = db.collection("students");

    const smsResults = [];

    for (const s of students) {
      if (!s.marks || s.marks.length === 0) continue; // skip if no marks
      if (!s.phone_number) continue; // skip if no phone number

      const mark = s.marks[0];
      const phone = formatPhoneNumber(s.phone_number);
      const name = s.student_name || "Student";

      // --- Save marks in MongoDB ---
      await collection.updateOne(
        { _id: new ObjectId(s.student_id) },
        { $setOnInsert: { marks: [] } },
        { upsert: true }
      );

      await collection.updateOne(
        { _id: new ObjectId(s.student_id) },
        [
          {
            $set: {
              marks: {
                $concatArrays: [{ $ifNull: ["$marks", []] }, s.marks]
              }
            }
          }
        ]
      );

      // --- Send SMS ---
      const message = MarksTemplate(name, mark.total, mark.subject, mark.obtained);
      try {
        const formData = new URLSearchParams();
        formData.append("api_key", process.env.SMS_BD_API_KEY);
        formData.append("to", phone);
        formData.append("msg", message);

        const response = await fetch("https://api.sms.net.bd/sendsms", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData
        });

        const result = await response.text();
        console.log(`✅ SMS sent to ${phone}: ${result}`);
        smsResults.push({ phone, success: true, result });
      } catch (err) {
        console.error(`❌ Failed to send SMS to ${phone}:`, err);
        smsResults.push({ phone, success: false, error: err.message });
      }
    }

    return NextResponse.json({ success: true, message: "✅ Marks added & SMS sent!", smsResults });
  } catch (err) {
    console.error("Error saving results:", err);
    return NextResponse.json({ error: "❌ Failed to save results" }, { status: 500 });
  }
}
